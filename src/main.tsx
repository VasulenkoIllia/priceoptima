import "@ant-design/v5-patch-for-react-19";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Після оновлення сервера у відкритій вкладці старі файли розділів уже видалено: перезавантажуємо сторінку один раз,
// щоб підтягнути нову збірку (прапорець не дає зациклитися, якщо файлу немає й після перезавантаження).
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "po-reloaded-after-update";
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});
window.addEventListener("load", () => {
  // сторінка завантажилась нормально — наступне оновлення знову може перезавантажити її раз
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem("po-reloaded-after-update");
    } catch {
      /* немає сховища — нічого */
    }
  }, 10_000);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
