// Este service worker foi desativado — ele causava telas travadas/desatualizadas
// em celulares (cache antigo do app). Ele agora só limpa tudo e se desinstala.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clientsList = await self.clients.matchAll({ type: "window" });
      clientsList.forEach((client) => client.navigate(client.url));
    })()
  );
});

self.addEventListener("fetch", () => {
  // Não intercepta mais nada — deixa o navegador buscar direto na rede.
});
