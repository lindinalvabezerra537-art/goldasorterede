import { Router, Request, Response } from "express";
import { db, paymentsTable, usersTable, referralsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendEvent, broadcastEvent } from "../app";
import { logger } from "../lib/logger";
import { MercadoPagoConfig, Payment } from "mercadopago";

const router = Router();

function checkAdmin(req: Request, res: Response): boolean {
  const auth = req.headers.authorization;
  const token = auth?.replace("Bearer ", "").trim();
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (!adminPassword) {
    res.status(500).json({ error: "Admin password not configured." });
    return false;
  }
  if (token !== adminPassword) {
    res.status(401).json({ error: "Não autorizado" });
    return false;
  }
  return true;
}

const PACKAGES: Record<number, number> = { 5: 500, 15: 1000, 30: 2000 };

function getMpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN ?? "";
  if (!accessToken) throw new Error("MP_ACCESS_TOKEN não configurado.");
  return new MercadoPagoConfig({ accessToken });
}


// ── Criar cobrança PIX via Mercado Pago ───────────────────────────────────────

router.post("/create", async (req, res) => {
  const { userId, plays } = req.body as { userId: number; plays: number };

  const amountCents = PACKAGES[plays];
  if (!amountCents) {
    res.status(400).json({ error: "Pacote inválido." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  if (!process.env.MP_ACCESS_TOKEN) {
    res.status(503).json({ error: "Pagamento não configurado. Fale com o administrador." });
    return;
  }

  const txId = `GOL${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  try {
    const client = getMpClient();
    const payment = new Payment(client);

    const payerEmail = `user${userId}@goldasorte.app`;

    const publicUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : (process.env.APP_URL ?? "");
    const notificationUrl = publicUrl ? `${publicUrl}/api/payments/webhook` : undefined;

    const result = await payment.create({
      body: {
        transaction_amount: amountCents / 100,
        payment_method_id: "pix",
        description: `Gol da Sorte - ${plays} jogadas`,
        external_reference: txId,
        notification_url: notificationUrl,
        payer: {
          email: payerEmail,
          first_name: user.name.split(" ")[0] ?? user.name,
          last_name: user.name.split(" ").slice(1).join(" ") || user.name,
        },
      },
    });

    const txData = result.point_of_interaction?.transaction_data;
    const pixPayload = txData?.qr_code;
    const qrBase64 = txData?.qr_code_base64;

    if (!result.id || !pixPayload) {
      logger.error({ result }, "MP create payment error");
      res.status(502).json({ error: "Erro ao criar cobrança PIX." });
      return;
    }

    await db.insert(paymentsTable).values({
      userId,
      plays,
      amountCents,
      txId,
      mpPaymentId: String(result.id),
      status: "pending",
    });

    res.json({
      txId,
      amount: (amountCents / 100).toFixed(2),
      plays,
      pixPayload,
      qrCode: qrBase64 ? `data:image/png;base64,${qrBase64}` : null,
    });
  } catch (err: unknown) {
    logger.error({ err }, "MP create error");
    res.status(502).json({ error: "Erro ao criar cobrança PIX." });
  }
});

// ── Poll status ───────────────────────────────────────────────────────────────

router.get("/:txId/status", async (req, res) => {
  const { txId } = req.params;
  const [paymentRecord] = await db.select().from(paymentsTable).where(eq(paymentsTable.txId, txId));
  if (!paymentRecord) {
    res.status(404).json({ error: "Pagamento não encontrado." });
    return;
  }

  if (paymentRecord.status === "confirmed") {
    res.json({ status: "confirmed", plays: paymentRecord.plays });
    return;
  }

  if (process.env.MP_ACCESS_TOKEN && paymentRecord.mpPaymentId) {
    try {
      const client = getMpClient();
      const payment = new Payment(client);
      const result = await payment.get({ id: Number(paymentRecord.mpPaymentId) });

      if (result.status === "approved") {
        await confirmPayment(txId);
        res.json({ status: "confirmed", plays: paymentRecord.plays });
        return;
      }
      logger.info({ mpStatus: result.status, txId }, "MP payment status polled");
    } catch (err) {
      logger.error({ err, txId }, "MP status check error");
    }
  }

  res.json({ status: paymentRecord.status, plays: paymentRecord.plays });
});

// ── Webhook Mercado Pago ──────────────────────────────────────────────────────

router.post("/webhook", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  try {
    // MP envia { type: "payment", data: { id: "..." } }
    // ou { action: "payment.updated", data: { id: "..." } }
    const type = (body.type ?? body.action) as string | undefined;
    const dataId = (body.data as Record<string, unknown> | undefined)?.id as string | undefined;

    const isPaymentEvent =
      type === "payment" ||
      type === "payment.updated" ||
      type === "payment.created";

    if (isPaymentEvent && dataId) {
      const client = getMpClient();
      const payment = new Payment(client);
      const result = await payment.get({ id: Number(dataId) });

      if (result.status === "approved" && result.external_reference) {
        await confirmPayment(result.external_reference);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Webhook error");
    res.status(500).json({ error: "Erro interno no webhook." });
  }
});

// ── Confirmação manual pelo admin ─────────────────────────────────────────────

router.post("/admin/confirm/:txId", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { txId } = req.params;
  const result = await confirmPayment(txId);
  if (!result) {
    res.status(404).json({ error: "Pagamento não encontrado ou já confirmado." });
    return;
  }
  res.json({ ok: true, playsAdded: result.plays });
});

// ── Lógica de confirmação ─────────────────────────────────────────────────────

async function confirmPayment(txId: string) {
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.txId, txId));
  if (!payment || payment.status !== "pending") return null;

  await db.update(paymentsTable)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(paymentsTable.txId, txId));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payment.userId));
  if (user) {
    const isFirstPayment = !user.hasPaid;

    await db.update(usersTable)
      .set({
        playsRemaining: user.playsRemaining + payment.plays,
        hasPaid: true,
        referralUnlocked: isFirstPayment ? true : user.referralUnlocked,
      })
      .where(eq(usersTable.id, payment.userId));

    sendEvent(payment.userId, { type: "plays_updated", data: { playsRemaining: user.playsRemaining + payment.plays, hasPaid: true, txId } });

    if (isFirstPayment && user.referredById) {
      const [referrer] = await db
        .select({ rankingPoints: usersTable.rankingPoints, playsRemaining: usersTable.playsRemaining, referredById: usersTable.referredById })
        .from(usersTable)
        .where(eq(usersTable.id, user.referredById));

      if (referrer) {
        await db.update(usersTable)
          .set({
            rankingPoints: (referrer.rankingPoints ?? 0) + 10,
            playsRemaining: (referrer.playsRemaining ?? 0) + 5,
            referralUnlocked: true,
          })
          .where(eq(usersTable.id, user.referredById));

        sendEvent(user.referredById, { type: "referral_reward", data: { addedPlays: 5, addedPoints: 10 } });

        await db.update(referralsTable)
          .set({ rewarded: true })
          .where(
            and(
              eq(referralsTable.referrerId, user.referredById),
              eq(referralsTable.referredId, user.id),
            )
          );

        if (referrer.referredById) {
          const [grandReferrer] = await db
            .select({ rankingPoints: usersTable.rankingPoints, playsRemaining: usersTable.playsRemaining })
            .from(usersTable)
            .where(eq(usersTable.id, referrer.referredById));

          if (grandReferrer) {
            await db.update(usersTable)
              .set({
                rankingPoints: (grandReferrer.rankingPoints ?? 0) + 3,
                playsRemaining: (grandReferrer.playsRemaining ?? 0) + 3,
              })
              .where(eq(usersTable.id, referrer.referredById));

            sendEvent(referrer.referredById, { type: "referral_reward", data: { addedPlays: 3, addedPoints: 3 } });
          }
        }
      }
    }
  }

  broadcastEvent({ type: "payment_confirmed", data: { userId: payment.userId, plays: payment.plays, amountCents: payment.amountCents } });
  return payment;
}

export default router;
