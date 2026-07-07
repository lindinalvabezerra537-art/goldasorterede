import { useState, useEffect, useRef } from "react";

function apiUrl(path: string) {
  return `/api${path}`;
}

const PACKAGES = [
  { plays: 5,  price: "R$ 5,00",  label: "STARTER",  highlight: true  },
  { plays: 15, price: "R$ 10,00", label: "POPULAR",   highlight: false },
  { plays: 30, price: "R$ 20,00", label: "PRO",       highlight: false },
];

interface Props {
  userId: number;
  onPurchased: (newPlays: number) => void;
  onClose: () => void;
}

interface PixData {
  txId: string;
  pixKey: string;
  pixName: string;
  amount: string;
  plays: number;
  pixPayload: string;
  qrCode: string;
}


export default function PurchaseModal({ userId, onPurchased, onClose }: Props) {
  const [selected, setSelected] = useState<number>(5);
  const [step, setStep]         = useState<"choose" | "pix" | "waiting" | "done">("choose");
  const [pixData, setPixData]   = useState<PixData | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [copied, setCopied]     = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist txId so a page reload can still confirm the payment
  useEffect(() => {
    if (pixData?.txId) {
      localStorage.setItem("gol_pending_txId", pixData.txId);
      localStorage.setItem("gol_pending_plays", String(pixData.plays));
    }
  }, [pixData]);

  // Helper: check status once and resolve if confirmed
  const checkOnce = async (txId: string, fallbackPlays: number) => {
    try {
      const res = await fetch(apiUrl(`/payments/${txId}/status`));
      const data = await res.json();
      if (data.status === "confirmed") {
        if (pollRef.current) clearInterval(pollRef.current);
        const userRes = await fetch(apiUrl(`/users/${userId}`));
        const userData = await userRes.json();
        const plays = userData?.user?.playsRemaining ?? fallbackPlays;
        localStorage.removeItem("gol_pending_txId");
        localStorage.removeItem("gol_pending_plays");
        onPurchased(plays);
        setStep("done");
        return true;
      }
    } catch {}
    return false;
  };

  // Instant confirmation via SSE window event (fired by App.tsx when plays_updated arrives)
  // Only accept events whose txId matches our current PIX transaction.
  useEffect(() => {
    if (!pixData || step === "choose" || step === "done") return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ plays: number; txId?: string }>).detail;
      if (detail.txId && detail.txId !== pixData.txId) return;
      if (!detail.txId) return;
      if (pollRef.current) clearInterval(pollRef.current);
      localStorage.removeItem("gol_pending_txId");
      localStorage.removeItem("gol_pending_plays");
      onPurchased(detail.plays);
      setStep("done");
    };

    window.addEventListener("gol-plays-updated", handler);
    return () => window.removeEventListener("gol-plays-updated", handler);
  }, [pixData, step, onPurchased]);

  // Poll payment status — also check immediately on mount and when user returns to tab
  useEffect(() => {
    if ((step !== "waiting" && step !== "pix") || !pixData) return;


    // Check immediately (handles returning from banking app)
    checkOnce(pixData.txId, pixData.plays);

    // Resume polling every 4 seconds
    pollRef.current = setInterval(() => {
      checkOnce(pixData.txId, pixData.plays);
    }, 4000);


    // When user switches back to this tab/app, check immediately
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        checkOnce(pixData.txId, pixData.plays);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [step, pixData, userId, onPurchased]);

  const handleGeneratePix = async () => {
    setLoading(true);
    setError("");
    try {
      const userName = localStorage.getItem("golUserName") || "";
      const userPhone = localStorage.getItem("golUserPhone") || "";
      const res = await fetch(apiUrl("/payments/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(userName ? { "X-User-Name": userName } : {}), ...(userPhone ? { "X-User-Phone": userPhone } : {}) },
        body: JSON.stringify({ userId, plays: selected }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao gerar PIX."); return; }
      setPixData(data);
      setStep("pix");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const copyKey = () => {
    if (!pixData) return;
    navigator.clipboard.writeText(pixData.pixKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const copyPayload = () => {
    if (!pixData) return;
    navigator.clipboard.writeText(pixData.pixPayload).then(() => {
      setCopiedQr(true);
      setTimeout(() => setCopiedQr(false), 2500);
    });
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,200,0,0.25)",
    borderRadius: 8, color: "#fff", fontSize: 13,
    padding: "10px 12px", width: "100%", boxSizing: "border-box",
    userSelect: "all", wordBreak: "break-all", fontFamily: "monospace",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: "linear-gradient(160deg, #111 0%, #1c1500 100%)",
        border: "1.5px solid rgba(255,200,0,0.35)",
        borderRadius: 20, padding: 24, width: "100%", maxWidth: 360,
        maxHeight: "90vh", overflowY: "auto",
      }}>

        {/* ── STEP 1: Escolher pacote ── */}
        {step === "choose" && (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 34, marginBottom: 6 }}>⚽</div>
              <div style={{ color: "#FFD700", fontSize: 19, fontWeight: 900, letterSpacing: 1 }}>
                COMPRAR JOGADAS
              </div>
              <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
                Escolha um pacote e pague via PIX
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {PACKAGES.map(pkg => (
                <div
                  key={pkg.plays}
                  onClick={() => setSelected(pkg.plays)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 18px", borderRadius: 12, cursor: "pointer",
                    border: selected === pkg.plays ? "2px solid #FFD700" : "1.5px solid rgba(255,255,255,0.1)",
                    background: selected === pkg.plays ? "rgba(255,200,0,0.12)" : pkg.highlight ? "rgba(255,255,255,0.04)" : "transparent",
                    position: "relative",
                  }}
                >
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
                      {pkg.plays} jogadas
                    </div>
                    {pkg.highlight && (
                      <div style={{ color: "#FFD700", fontSize: 11, fontWeight: 700 }}>MAIS POPULAR</div>
                    )}
                  </div>
                  <div style={{ color: "#FFD700", fontWeight: 900, fontSize: 17 }}>{pkg.price}</div>
                  {selected === pkg.plays && (
                    <div style={{
                      position: "absolute", right: -8, top: -8,
                      background: "#FFD700", color: "#000", borderRadius: "50%",
                      width: 20, height: 20, display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 11, fontWeight: 900,
                    }}>✓</div>
                  )}
                </div>
              ))}
            </div>

            {error && <div style={{ color: "#ff6060", fontSize: 13, textAlign: "center", marginBottom: 10 }}>{error}</div>}

            <button
              onClick={handleGeneratePix}
              disabled={loading}
              style={{
                width: "100%", background: loading ? "#444" : "linear-gradient(135deg, #00c853, #00e676)",
                color: "#000", border: "none", borderRadius: 12, padding: "15px",
                fontSize: 15, fontWeight: 900, cursor: loading ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {loading ? "GERANDO PIX..." : <><span style={{ fontSize: 20 }}>💳</span> PAGAR COM PIX</>}
            </button>

            <button onClick={onClose} style={{ width: "100%", background: "transparent", color: "#666", border: "none", fontSize: 13, cursor: "pointer", padding: "12px 0 0" }}>
              Agora não
            </button>
          </>
        )}

        {/* ── STEP 2: PIX Copia e Cola ── */}
        {step === "pix" && pixData && (
          <>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ color: "#FFD700", fontSize: 17, fontWeight: 900 }}>
                💳 PAGUE COM PIX
              </div>
              <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
                {pixData.plays} jogadas por <strong style={{ color: "#fff" }}>R$ {pixData.amount}</strong>
              </div>
            </div>

            {/* Instrução principal */}
            <div style={{
              background: "rgba(0,200,83,0.08)", border: "1px solid rgba(0,200,83,0.25)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 14,
              color: "#ccc", fontSize: 13, lineHeight: 1.6, textAlign: "center",
            }}>
              📱 Copie a chave abaixo e cole no <strong style={{ color: "#fff" }}>app do seu banco</strong> para pagar
            </div>

            {/* Copia e Cola — destaque principal */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "#FFD700", fontSize: 12, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                CHAVE PIX COPIA E COLA
              </div>
              <div style={{
                ...inputStyle,
                fontSize: 11,
                padding: "12px",
                maxHeight: 80,
                overflowY: "auto",
                lineHeight: 1.5,
              }}>
                {pixData.pixPayload}
              </div>
              <button
                onClick={copyPayload}
                style={{
                  width: "100%", marginTop: 8,
                  background: copiedQr ? "rgba(0,200,83,0.25)" : "linear-gradient(135deg, #00c853, #00e676)",
                  border: "none",
                  borderRadius: 10, color: "#000",
                  fontSize: 15, fontWeight: 900, padding: "14px", cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {copiedQr ? "✅ COPIADO! AGORA ABRA SEU BANCO" : "📋 COPIAR CHAVE PIX"}
              </button>
            </div>

            <div style={{
              background: "rgba(255,200,0,0.08)", border: "1px solid rgba(255,200,0,0.2)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 14,
              color: "#bbb", fontSize: 12, lineHeight: 1.5,
            }}>
              ⚡ Após pagar, suas jogadas serão liberadas <strong style={{ color: "#FFD700" }}>automaticamente</strong> em até 1 minuto.
            </div>

            <button onClick={() => setStep("choose")} style={{ width: "100%", background: "transparent", color: "#666", border: "none", fontSize: 13, cursor: "pointer", padding: "10px 0 0" }}>
              ← Voltar
            </button>
          </>
        )}

        {/* ── STEP 3: Aguardando confirmação ── */}
        {step === "waiting" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>⏳</div>
            <div style={{ color: "#FFD700", fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
              AGUARDANDO PAGAMENTO
            </div>
            <div style={{ color: "#888", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              Verificando o pagamento a cada 4 segundos.<br />
              Assim que confirmado, suas jogadas aparecerão automaticamente!
            </div>
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 24 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: "50%", background: "#FFD700",
                  animation: `pulse 1.2s ${i * 0.4}s ease-in-out infinite`,
                }} />
              ))}
            </div>
            <button
              onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setStep("pix"); }}
              style={{ background: "transparent", color: "#666", border: "none", fontSize: 13, cursor: "pointer" }}
            >
              ← Ver QR Code novamente
            </button>
            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 0.3; transform: scale(0.8); }
                50% { opacity: 1; transform: scale(1.2); }
              }
            `}</style>
          </div>
        )}

        {/* ── STEP 4: Confirmado! ── */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
            <div style={{ color: "#00e676", fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
              PAGAMENTO CONFIRMADO!
            </div>
            <div style={{ color: "#aaa", fontSize: 14, marginBottom: 20 }}>
              Suas jogadas foram liberadas.<br />
              Boa sorte! ⚽
            </div>
            <button
              onClick={onClose}
              style={{
                background: "linear-gradient(135deg, #FFD700, #FF8C00)",
                color: "#000", border: "none", borderRadius: 12, padding: "14px 32px",
                fontSize: 16, fontWeight: 900, cursor: "pointer",
              }}
            >
              JOGAR AGORA!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
