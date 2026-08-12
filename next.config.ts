import type { NextConfig } from "next";

const isFirebaseStaticExport = process.env.FIREBASE_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  // Съёмка ходит на 127.0.0.1, а Next 16 считает это ЧУЖИМ origin и режет
  // dev-ресурсы: HMR-сокет не встаёт, часть чанков отдаётся 404, страница
  // остаётся серверным HTML и НЕ ГИДРАТИРУЕТСЯ. Симптом обманчив — ошибок в
  // консоли нет, `#enter-game` в DOM есть, но он навсегда disabled, потому
  // что `ready` приходит из `<Canvas onCreated>`, а сам Canvas ждёт
  // гидратации. Ломаются так ВСЕ миры сразу, поэтому выглядит как поломка
  // сцены, которую только что правили. Скрипты в `scripts/` ходят на
  // 127.0.0.1 (capture-vx8-range, object-lab-capture, perf-probe,
  // landscape-lab-server) — разрешаем origin здесь, одной строкой на всех.
  allowedDevOrigins: ["127.0.0.1"],
  output: isFirebaseStaticExport ? "export" : undefined,
  typescript: isFirebaseStaticExport
    ? { tsconfigPath: "tsconfig.firebase.json" }
    : undefined,
};

export default nextConfig;
