import puppeteer from "puppeteer";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto("http://localhost:3000/offline", { waitUntil: "networkidle0", timeout: 30000 });
await page.evaluate(() => new Promise((res, rej) => {
  const req = indexedDB.open("beauty-pos-offline", 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore("catalogo", { keyPath: "sucursalId" });
    req.result.createObjectStore("ventas", { keyPath: "clave" });
  };
  req.onsuccess = () => {
    const tx = req.result.transaction("catalogo", "readwrite");
    tx.objectStore("catalogo").put({
      organizacionId: "org", sucursalId: "s1", sucursalNombre: "Centro", moneda: "MXN",
      guardadoAt: new Date().toISOString(),
      servicios: [{ id: "sv1", nombre: "Servicio Prueba", precio: "120" }],
      productos: [], mediosPago: [{ id: "m1", nombre: "Efectivo", categoria: "efectivo" }],
      staff: [],
    });
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  };
  req.onerror = () => rej(req.error);
}));
await page.goto("http://localhost:3000/offline/venta", { waitUntil: "networkidle0", timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));
console.log("onLine:", await page.evaluate(() => navigator.onLine));
const text = await page.evaluate(() => document.body.innerText);
console.log("has servicio:", text.includes("Servicio Prueba"), "| has 'No hay catálogo':", text.includes("No hay catálogo"));
await browser.close();
