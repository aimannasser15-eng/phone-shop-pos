import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

// ─── Firebase Configuration ─────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDgPf1bqMkpnq6CyXRUNT3BIL-Jc24DZCE",
  authDomain: "signature-phones-pos.firebaseapp.com",
  projectId: "signature-phones-pos",
  storageBucket: "signature-phones-pos.firebasestorage.app",
  messagingSenderId: "794374452986",
  appId: "1:794374452986:web:007a85e64a36b7a3563b43"
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

const TABS = ["pos", "inventory", "sales", "customers", "repairs", "tradeins", "deposits", "reports"];
const TAB_LABELS = { pos: "Point of Sale", inventory: "Inventory", sales: "Sales History", customers: "Customers", repairs: "Repairs", tradeins: "Trade-Ins", deposits: "Deposits", reports: "Reports" };
const TRADEIN_STATUSES = ["Received", "Testing", "Added to Stock", "Rejected"];
const DEPOSIT_STATUSES = ["Active", "Completed", "Expired", "Cancelled"];
const TAB_ICONS = {
  pos: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z",
  inventory: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  sales: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  customers: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  repairs: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  tradeins: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  deposits: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  reports: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
};

const CATEGORIES = ["Smartphones", "Laptops", "Tablets", "Accessories", "Cases", "Chargers", "Screen Protectors", "Cables", "Audio", "Other"];
const SERIALIZED_CATEGORIES = ["Smartphones", "Laptops", "Tablets", "Audio"];
const REPAIR_STATUSES = ["Received", "Diagnosing", "Waiting for Parts", "In Repair", "Testing", "Ready for Pickup", "Completed"];
const GRADES = ["A", "B", "C", "D"];

const currency = (n) => `£${Number(n || 0).toFixed(2)}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);

const getStock = (p) => {
  if (p.serialized) return (p.units || []).filter(u => u.status === "in_stock").length;
  return p.stock || 0;
};

// ─── Excel Helpers ─────────────────────────────────────────────────

// Parse rows from Excel into product objects, grouping by SKU
const parseExcelRows = (rows) => {
  const grouped = {}; // key: sku → product
  const errors = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +2 because of header + 1-indexing
    // Normalise keys (case-insensitive)
    const r = {};
    Object.keys(row).forEach(k => { r[k.toLowerCase().trim()] = row[k]; });

    const name = (r.name || r["product name"] || "").toString().trim();
    const sku = (r.sku || "").toString().trim();
    const category = (r.category || "Other").toString().trim();
    const cost = parseFloat(r.cost || r["cost price"] || 0);
    const price = parseFloat(r.price || r["selling price"] || 0);
    const stockRaw = r.stock || r.quantity || r.qty;
    const imei = (r.imei || r.serial || r["serial number"] || "").toString().trim();
    const color = (r.colour || r.color || "").toString().trim();
    const storage = (r.storage || r.memory || "").toString().trim();
    const unitCost = parseFloat(r["unit cost"] || r.unitcost || 0) || cost;
    const unitPrice = parseFloat(r["unit price"] || r["sell price"] || r.unitprice || 0) || price;
    const grade = (r.grade || "").toString().trim().toUpperCase();
    const supplier = (r.supplier || "").toString().trim();

    if (!name) { errors.push(`Row ${rowNum}: missing Name`); return; }
    if (!sku) { errors.push(`Row ${rowNum}: missing SKU`); return; }
    if (!price || price <= 0) { errors.push(`Row ${rowNum}: missing or invalid Price`); return; }

    const key = sku.toUpperCase();
    if (!grouped[key]) {
      grouped[key] = { name, sku, category, cost, price, units: [], stock: 0, serialized: false };
    }
    const p = grouped[key];

    if (imei) {
      // Serialized unit row — uses per-unit cost if provided, otherwise product default
      p.serialized = true;
      p.units.push({ id: uid(), imei, color, storage, cost: unitCost, price: unitPrice, grade: GRADES.includes(grade) ? grade : "", supplier, status: "in_stock" });
    } else if (stockRaw !== undefined && stockRaw !== "" && stockRaw !== null) {
      // Non-serialized quantity row
      p.stock += parseInt(stockRaw, 10) || 0;
    } else {
      errors.push(`Row ${rowNum}: must have either IMEI/Serial OR Quantity`);
    }
  });

  return { products: Object.values(grouped), errors };
};

// Build a downloadable template Excel
const downloadTemplate = () => {
  const data = [
    { Name: "iPhone 15 Pro Max", SKU: "IP15PM", Category: "Smartphones", Cost: 950, Price: 1199, Quantity: "", IMEI: "353456789012345", Colour: "Natural Titanium", Storage: "256GB", Grade: "A", "Unit Cost": 920, "Unit Price": 1199, Supplier: "PhoneStock UK" },
    { Name: "iPhone 15 Pro Max", SKU: "IP15PM", Category: "Smartphones", Cost: 950, Price: 1199, Quantity: "", IMEI: "353456789012346", Colour: "Blue Titanium", Storage: "512GB", Grade: "B", "Unit Cost": 980, "Unit Price": 1099, Supplier: "MobileWholesale" },
    { Name: "iPhone 15 Pro Max", SKU: "IP15PM", Category: "Smartphones", Cost: 950, Price: 1199, Quantity: "", IMEI: "353456789012347", Colour: "Black Titanium", Storage: "1TB", Grade: "A", "Unit Cost": 1050, "Unit Price": 1349, Supplier: "PhoneStock UK" },
    { Name: "USB-C Charger 65W", SKU: "USBC65", Category: "Chargers", Cost: 12, Price: 29.99, Quantity: 25, IMEI: "", Colour: "", Storage: "", Grade: "", "Unit Cost": "", "Unit Price": "", Supplier: "" },
    { Name: "iPhone 15 Clear Case", SKU: "IP15CC", Category: "Cases", Cost: 5, Price: 19.99, Quantity: 40, IMEI: "", Colour: "", Storage: "", Grade: "", "Unit Cost": "", "Unit Price": "", Supplier: "" },
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.writeFile(wb, "phone-shop-import-template.xlsx");
};

// ─── Shop Branding & T&Cs ───────────────────────────────────────────

const SHOP = {
  name: "SP Phones",
  tagline: "Stay Connected",
  address: "12 Dovecot Place, Liverpool L14 9PH",
  phone: "07778 555546",
  email: "signaturephones@outlook.com",
};

const SALE_TERMS = [
  "If you are unsatisfied with your item within the first three days of purchase we can offer an exchange or credit note (credit note must be used within 4 weeks).",
  "If you have any fault with the device or you have any queries about your device please refer direct to SP Phones.",
  "Warranty will be voided if physical damage found.",
  "We will repair the device if under warranty, if its beyond economical repair we will swap like for like.",
  "Warranty will be voided if device has been repaired by third party.",
  "Some second hand devices may have some parts replaced.",
  "4 weeks warranty (warranty starts from day of purchase).",
  "Deposit will be lost if not paid in full within 4 weeks of purchase.",
  "Deposits are non-refundable.",
];

const REPAIR_TERMS = [
  "Any screens that have physical damage, distorted lines or leakage within the LCD will not be covered under the warranty.",
  "Receipt must be brought on collection.",
  "Often damaged devices can cause other faults to some parts of the device, we will not be liable to any other internal damage.",
  "SP Phones will not be responsible for loss of any data, photos or videos lost during or after repair.",
  "SP Phones will repair the fault reported by the customer, any other fault found at the time or after will be an additional charge.",
  "All equipment are checked and repaired at owner's risk. We take no responsibility occurred before during or after repair.",
  "All phones remaining on site over 4 weeks shall remain the property of SP Phones to cover cost of repair.",
];

// Build printable receipt HTML
const buildReceiptHTML = ({ type, data, customer }) => {
  const isSale = type === "sale";
  const title = isSale ? "SALES RECEIPT" : "REPAIR RECEIPT";
  const terms = isSale ? SALE_TERMS : REPAIR_TERMS;
  const termsTitle = isSale ? "SALES TERMS & CONDITIONS" : "REPAIR TERMS & CONDITIONS";
  const receiptNum = data.id.toUpperCase();
  const dateStr = new Date(isSale ? data.date : data.dateIn).toLocaleString("en-GB");

  const itemsHTML = isSale
    ? data.items.map(i => `
        <tr>
          <td>${i.qty}× ${i.name}${(i.color || i.storage) ? `<br><span style="color:#666;font-size:11px">${[i.color, i.storage, i.grade ? `Grade ${i.grade}` : ""].filter(Boolean).join(" · ")}</span>` : ""}${i.imei ? `<br><span style="color:#b45309;font-size:11px;font-family:monospace">IMEI/SN: ${i.imei}</span>` : ""}</td>
          <td style="text-align:right">£${(i.price * i.qty).toFixed(2)}</td>
        </tr>`).join("")
    : `
        <tr>
          <td><strong>${data.device}</strong>${data.imei ? `<br><span style="color:#b45309;font-size:11px;font-family:monospace">IMEI/SN: ${data.imei}</span>` : ""}<br><span style="color:#666;font-size:12px">Fault: ${data.issue}</span>${data.notes ? `<br><span style="color:#666;font-size:11px">Notes: ${data.notes}</span>` : ""}</td>
          <td style="text-align:right">£${(data.cost || 0).toFixed(2)}</td>
        </tr>`;

  const totalsHTML = isSale
    ? `
        <tr><td>Subtotal</td><td style="text-align:right">£${data.subtotal.toFixed(2)}</td></tr>
        ${data.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right;color:#dc2626">-£${data.discountAmt.toFixed(2)}</td></tr>` : ""}
        <tr style="font-size:18px;font-weight:800;border-top:2px solid #000"><td style="padding-top:8px">TOTAL</td><td style="text-align:right;padding-top:8px">£${data.total.toFixed(2)}</td></tr>`
    : `
        <tr><td>Status</td><td style="text-align:right"><strong>${data.status}</strong></td></tr>
        <tr style="font-size:18px;font-weight:800;border-top:2px solid #000"><td style="padding-top:8px">REPAIR COST</td><td style="text-align:right;padding-top:8px">£${(data.cost || 0).toFixed(2)}</td></tr>`;

  return `<!DOCTYPE html>
<html><head><title>${title} - ${receiptNum}</title>
<style>
  @media print { .no-print { display: none !important; } body { margin: 0; } }
  body { font-family: -apple-system, "Segoe UI", sans-serif; max-width: 380px; margin: 20px auto; padding: 20px; color: #111; background: #fff; }
  .logo-box { display: none; }
  h1 { text-align: center; margin: 0; font-size: 32px; letter-spacing: 1px; font-weight: 900; }
  .tagline { text-align: center; color: #666; font-size: 12px; font-style: italic; margin-top: 4px; }
  .shop-info { text-align: center; font-size: 11px; color: #666; margin: 10px 0 14px; line-height: 1.5; }
  .receipt-type { text-align: center; background: #111; color: #fff; padding: 6px; font-size: 13px; font-weight: 700; letter-spacing: 2px; margin: 12px 0; }
  .meta { font-size: 12px; color: #333; margin-bottom: 12px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 6px 0; vertical-align: top; }
  .items-table { border-top: 1px dashed #666; border-bottom: 1px dashed #666; margin: 12px 0; }
  .totals-table td { padding: 4px 0; }
  .terms { margin-top: 20px; padding-top: 14px; border-top: 1px dashed #666; font-size: 10px; color: #444; line-height: 1.5; }
  .terms h3 { font-size: 11px; letter-spacing: 1px; margin: 0 0 6px; }
  .terms ul { margin: 0; padding-left: 16px; }
  .terms li { margin-bottom: 4px; }
  .thanks { text-align: center; margin-top: 16px; font-size: 12px; color: #555; }
  .btn-row { text-align: center; margin-top: 20px; }
  .btn-row button { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; cursor: pointer; margin: 0 4px; font-weight: 600; }
</style></head>
<body>
  <h1>${SHOP.name}</h1>
  <div class="tagline">${SHOP.tagline}</div>
  <div class="shop-info">${SHOP.address}<br>${SHOP.phone} · ${SHOP.email}</div>
  <div class="receipt-type">${title}</div>
  <div class="meta">
    <strong>Receipt #:</strong> ${receiptNum}<br>
    <strong>Date:</strong> ${dateStr}<br>
    ${customer ? `<strong>Customer:</strong> ${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}` : "<strong>Customer:</strong> Walk-in"}
  </div>
  <table class="items-table"><tbody>${itemsHTML}</tbody></table>
  <table class="totals-table"><tbody>${totalsHTML}</tbody></table>
  ${data.payment ? `<div style="font-size:12px;color:#333;margin-top:8px;padding-top:8px;border-top:1px dashed #666"><strong>Payment:</strong> ${data.payment === "mix" ? `Cash £${(data.cashPaid || 0).toFixed(2)} + Card £${(data.cardPaid || 0).toFixed(2)}` : data.payment === "card" ? "Card" : "Cash"}</div>` : ""}
  ${data.staff ? `<div style="font-size:11px;color:#666;margin-top:4px"><strong>Served by:</strong> ${data.staff}</div>` : ""}
  <div class="thanks">${isSale ? "Thank you for your purchase!" : "Thank you for choosing us for your repair."}</div>
  <div class="terms">
    <h3>${termsTitle}</h3>
    <ul>${terms.map(t => `<li>${t}</li>`).join("")}</ul>
  </div>
  <div class="btn-row no-print">
    <button onclick="window.print()">🖨 Print</button>
    <button onclick="window.close()">Close</button>
  </div>
</body></html>`;
};

// Build plain-text version (for email/WhatsApp body)
const buildReceiptText = ({ type, data, customer }) => {
  const isSale = type === "sale";
  const L = [];
  L.push(`*${SHOP.name}* — ${SHOP.tagline}`);
  L.push(`${isSale ? "SALES RECEIPT" : "REPAIR RECEIPT"} #${data.id.toUpperCase()}`);
  L.push(`Date: ${new Date(isSale ? data.date : data.dateIn).toLocaleString("en-GB")}`);
  if (customer) L.push(`Customer: ${customer.name}${customer.phone ? ` (${customer.phone})` : ""}`);
  L.push("");
  L.push("─────────────────────");
  if (isSale) {
    data.items.forEach(i => {
      L.push(`${i.qty}x ${i.name} — £${(i.price * i.qty).toFixed(2)}`);
      if (i.color || i.storage) L.push(`   ${[i.color, i.storage, i.grade ? `Grade ${i.grade}` : ""].filter(Boolean).join(" · ")}`);
      if (i.imei) L.push(`   IMEI/SN: ${i.imei}`);
    });
    L.push("─────────────────────");
    L.push(`Subtotal: £${data.subtotal.toFixed(2)}`);
    if (data.discount > 0) L.push(`Discount: -£${data.discountAmt.toFixed(2)}`);
    L.push(`*TOTAL: £${data.total.toFixed(2)}*`);
  } else {
    L.push(`Device: ${data.device}`);
    if (data.imei) L.push(`IMEI/SN: ${data.imei}`);
    L.push(`Fault: ${data.issue}`);
    L.push(`Status: ${data.status}`);
    L.push("─────────────────────");
    L.push(`*Repair Cost: £${(data.cost || 0).toFixed(2)}*`);
  }
  if (data.payment) {
    L.push(`Payment: ${data.payment === "mix" ? `Cash £${(data.cashPaid || 0).toFixed(2)} + Card £${(data.cardPaid || 0).toFixed(2)}` : data.payment === "card" ? "Card" : "Cash"}`);
  }
  L.push("");
  L.push(isSale ? "Thank you for your purchase!" : "Thank you for choosing SP Phones.");
  L.push("");
  L.push(`${SHOP.phone} · ${SHOP.email}`);
  L.push("");
  L.push("═════════════════════");
  L.push(isSale ? "*SALES TERMS & CONDITIONS*" : "*REPAIR TERMS & CONDITIONS*");
  L.push("═════════════════════");
  const terms = isSale ? SALE_TERMS : REPAIR_TERMS;
  terms.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  return L.join("\n");
};

// Open receipt in a new window for printing
const printReceipt = (params) => {
  const html = buildReceiptHTML(params);
  const win = window.open("", "_blank", "width=440,height=700");
  if (!win) { alert("Please allow pop-ups to print the receipt."); return; }
  win.document.write(html);
  win.document.close();
};

// Generate receipt as downloadable HTML file
const downloadReceiptFile = (params) => {
  const html = buildReceiptHTML(params);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-${params.data.id.toUpperCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Deposit Receipt Builder ───────────────────────────────────────
const buildDepositReceiptHTML = (deposit, customer) => {
  const items = deposit.items && deposit.items.length > 0 ? deposit.items : (deposit.productId ? [{ name: deposit.productName, imei: deposit.imei, color: deposit.color, storage: deposit.storage, grade: deposit.grade, price: deposit.agreedPrice }] : []);
  const balance = deposit.agreedPrice - deposit.depositAmount;
  const itemsHTML = items.map(it => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px dashed #ccc">
        <strong>${it.name}</strong>
        ${it.imei ? `<br><span style="color:#b45309;font-size:11px;font-family:monospace">IMEI: ${it.imei}</span>` : ""}
        ${(it.color || it.storage || it.grade) ? `<br><span style="color:#666;font-size:11px">${[it.color, it.storage, it.grade ? `Grade ${it.grade}` : ""].filter(Boolean).join(" · ")}</span>` : ""}
      </td>
      <td style="text-align:right;padding:6px 0;border-bottom:1px dashed #ccc;font-weight:700">£${(it.price || 0).toFixed(2)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Deposit Receipt — ${SHOP.name}</title>
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 380px; margin: 20px auto; padding: 16px; color: #222; }
  h1 { text-align: center; margin: 0 0 4px; font-size: 28px; font-weight: 900; letter-spacing: 1px; }
  .shop-info { text-align: center; font-size: 11px; color: #666; margin-bottom: 8px; }
  .deposit-badge { display: inline-block; background: #f59e0b; color: #fff; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; }
  .header-meta { display: flex; justify-content: space-between; font-size: 12px; margin: 14px 0 8px; padding: 8px 0; border-top: 2px solid #333; border-bottom: 1px dashed #999; }
  table { width: 100%; border-collapse: collapse; }
  .totals tr td { padding: 4px 0; font-size: 13px; }
  .totals tr.balance td { font-size: 16px; font-weight: 900; color: #b45309; padding-top: 8px; border-top: 2px solid #333; }
  .deadline-box { padding: 10px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; text-align: center; font-size: 12px; color: #92400e; margin: 12px 0; }
  .footer { text-align: center; font-size: 10px; color: #999; margin-top: 14px; }
  @media print { body { margin: 0; max-width: none; } }
</style></head><body>
  <h1>${SHOP.name}</h1>
  <div class="shop-info">${SHOP.address}<br>${SHOP.phone} · ${SHOP.email}</div>
  <div style="text-align:center;margin:8px 0"><span class="deposit-badge">📅 DEPOSIT RECEIPT</span></div>
  <div class="header-meta">
    <div><strong>Receipt #:</strong> ${deposit.id.toUpperCase().substring(0, 8)}</div>
    <div><strong>${new Date(deposit.dateTaken).toLocaleDateString("en-GB")}</strong></div>
  </div>
  <div style="font-size:12px;margin-bottom:10px">
    <strong>Customer:</strong> ${customer?.name || "—"}<br>
    <strong>Phone:</strong> ${customer?.phone || "—"}
  </div>
  <div style="font-size:11px;color:#666;margin:8px 0;text-transform:uppercase;letter-spacing:0.5px;font-weight:700">Items Reserved</div>
  <table>${itemsHTML}</table>
  <table class="totals" style="margin-top:10px">
    <tr><td>Total Price:</td><td style="text-align:right;font-weight:700">£${deposit.agreedPrice.toFixed(2)}</td></tr>
    <tr><td style="color:#10b981">Deposit Paid (${deposit.depositMethod === "mix" ? "Cash + Card" : deposit.depositMethod === "card" ? "Card" : "Cash"}):</td><td style="text-align:right;font-weight:700;color:#10b981">£${deposit.depositAmount.toFixed(2)}</td></tr>
    <tr class="balance"><td>BALANCE DUE:</td><td style="text-align:right">£${balance.toFixed(2)}</td></tr>
  </table>
  <div class="deadline-box">
    ⚠️ <strong>Pay balance by ${new Date(deposit.deadline).toLocaleDateString("en-GB")}</strong><br>
    Items reserved until this date<br>
    Deposit is non-refundable if not collected
  </div>
  <div class="footer">Thank you for your business · Please bring this receipt when collecting</div>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
};

const printDepositReceipt = (deposit, customer) => {
  const html = buildDepositReceiptHTML(deposit, customer);
  const win = window.open("", "_blank", "width=440,height=700");
  if (!win) { alert("Please allow pop-ups to print the receipt."); return; }
  win.document.write(html);
  win.document.close();
};

const shareDepositReceipt = async (deposit, customer, method) => {
  const html = buildDepositReceiptHTML(deposit, customer);
  const fileName = `deposit-receipt-${deposit.id.toUpperCase().substring(0, 8)}.html`;
  const file = new File([html], fileName, { type: "text/html" });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ title: `Deposit Receipt — ${SHOP.name}`, files: [file] });
      return;
    } catch (e) { if (e.name === "AbortError") return; }
  }

  // Fallback: download + open WhatsApp/Email
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);

  const balance = deposit.agreedPrice - deposit.depositAmount;
  const summary = `${SHOP.name} — Deposit Receipt #${deposit.id.toUpperCase().substring(0, 8)}\n\nTotal: £${deposit.agreedPrice.toFixed(2)}\nDeposit Paid: £${deposit.depositAmount.toFixed(2)}\nBalance Due: £${balance.toFixed(2)}\nDeadline: ${new Date(deposit.deadline).toLocaleDateString("en-GB")}\n\n📎 Receipt file downloaded — please attach it to this message.`;
  if (method === "whatsapp") {
    const cleanPhone = (customer?.phone || "").replace(/[^0-9]/g, "");
    const text = encodeURIComponent(summary);
    window.open(cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`, "_blank");
  } else if (method === "email") {
    window.location.href = `mailto:${customer?.email || ""}?subject=${encodeURIComponent(`Deposit Receipt — ${SHOP.name}`)}&body=${encodeURIComponent(summary)}`;
  }
};

// Share receipt as file (uses Web Share API on mobile/iPad, falls back to download)
const shareReceiptFile = async (params, method, contact) => {
  const html = buildReceiptHTML(params);
  const receiptName = `receipt-${params.data.id.toUpperCase()}.html`;
  const file = new File([html], receiptName, { type: "text/html" });

  // Try Web Share API (works on iPad/iPhone Safari)
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ title: `${params.type === "sale" ? "Sales" : "Repair"} Receipt — ${SHOP.name}`, files: [file] });
      return;
    } catch (e) { if (e.name === "AbortError") return; }
  }

  // Fallback: download file + open WhatsApp/Email with text summary
  downloadReceiptFile(params);
  if (method === "whatsapp") {
    const text = encodeURIComponent(buildReceiptText(params) + "\n\n📎 Receipt file downloaded — please attach it to this message.");
    const cleanPhone = (contact || "").replace(/[^0-9]/g, "");
    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  } else if (method === "email") {
    const subject = encodeURIComponent(`${params.type === "sale" ? "Sales" : "Repair"} Receipt #${params.data.id.toUpperCase()} — ${SHOP.name}`);
    const body = encodeURIComponent(buildReceiptText(params) + "\n\n📎 Receipt file downloaded — please attach it to this email.");
    window.location.href = `mailto:${contact || ""}?subject=${subject}&body=${body}`;
  }
};

// Shorthand wrappers
const sendWhatsApp = (params, phone) => shareReceiptFile(params, "whatsapp", phone);
const sendEmail = (params, email) => shareReceiptFile(params, "email", email);

const SAMPLE_PRODUCTS = [
  {
    id: uid(), name: "iPhone 15 Pro Max", category: "Smartphones", price: 1199, cost: 950, sku: "IP15PM", serialized: true,
    units: [
      { id: uid(), imei: "353456789012345", color: "Natural Titanium", storage: "256GB", status: "in_stock" },
      { id: uid(), imei: "353456789012346", color: "Natural Titanium", storage: "512GB", status: "in_stock" },
      { id: uid(), imei: "353456789012347", color: "Blue Titanium", storage: "256GB", status: "in_stock" },
      { id: uid(), imei: "353456789012348", color: "Black Titanium", storage: "1TB", status: "in_stock" },
      { id: uid(), imei: "353456789012349", color: "White Titanium", storage: "128GB", status: "in_stock" },
    ]
  },
  {
    id: uid(), name: "Samsung Galaxy S24 Ultra", category: "Smartphones", price: 1299, cost: 1020, sku: "SGS24U", serialized: true,
    units: [
      { id: uid(), imei: "354876543210987", color: "Titanium Black", storage: "256GB", status: "in_stock" },
      { id: uid(), imei: "354876543210988", color: "Titanium Grey", storage: "512GB", status: "in_stock" },
      { id: uid(), imei: "354876543210989", color: "Titanium Violet", storage: "1TB", status: "in_stock" },
    ]
  },
  {
    id: uid(), name: "Google Pixel 8 Pro", category: "Smartphones", price: 999, cost: 780, sku: "GP8P", serialized: true,
    units: [
      { id: uid(), imei: "356712348765432", color: "Obsidian", storage: "128GB", status: "in_stock" },
      { id: uid(), imei: "356712348765433", color: "Porcelain", storage: "256GB", status: "in_stock" },
      { id: uid(), imei: "356712348765434", color: "Bay", storage: "256GB", status: "in_stock" },
      { id: uid(), imei: "356712348765435", color: "Obsidian", storage: "512GB", status: "in_stock" },
    ]
  },
  { id: uid(), name: "USB-C Fast Charger 65W", category: "Chargers", price: 29.99, cost: 12, stock: 25, sku: "USBC65", serialized: false, units: [] },
  { id: uid(), name: "iPhone 15 Clear Case", category: "Cases", price: 19.99, cost: 5, stock: 40, sku: "IP15CC", serialized: false, units: [] },
  { id: uid(), name: "Tempered Glass iPhone 15", category: "Screen Protectors", price: 12.99, cost: 2.5, stock: 50, sku: "TGIP15", serialized: false, units: [] },
  {
    id: uid(), name: "AirPods Pro 2", category: "Audio", price: 249, cost: 180, sku: "APP2", serialized: true,
    units: [
      { id: uid(), imei: "SN-APP2-00101", color: "White", storage: "", status: "in_stock" },
      { id: uid(), imei: "SN-APP2-00102", color: "White", storage: "", status: "in_stock" },
      { id: uid(), imei: "SN-APP2-00103", color: "White", storage: "", status: "in_stock" },
      { id: uid(), imei: "SN-APP2-00104", color: "White", storage: "", status: "in_stock" },
      { id: uid(), imei: "SN-APP2-00105", color: "White", storage: "", status: "in_stock" },
      { id: uid(), imei: "SN-APP2-00106", color: "White", storage: "", status: "in_stock" },
      { id: uid(), imei: "SN-APP2-00107", color: "White", storage: "", status: "in_stock" },
      { id: uid(), imei: "SN-APP2-00108", color: "White", storage: "", status: "in_stock" },
    ]
  },
  { id: uid(), name: "Lightning Cable 2m", category: "Cables", price: 14.99, cost: 3, stock: 30, sku: "LC2M", serialized: false, units: [] },
];

// Load data from Firestore (one document per "key" under shop/data/)
const loadData = async (key, fallback) => {
  try {
    const snap = await getDoc(doc(db, "shop", key));
    return snap.exists() ? (snap.data().value || fallback) : fallback;
  } catch (e) { console.error("Load error:", e); return fallback; }
};
// Save data to Firestore
const saveData = async (key, data) => {
  try { await setDoc(doc(db, "shop", key), { value: data, updatedAt: new Date().toISOString() }); }
  catch (e) { console.error("Save error:", e); }
};

// ─── Reusable Components ────────────────────────────────────────────

const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#ffffff", border: "1px solid #d4d8e0", borderRadius: 16, padding: 28, width: wide ? 680 : 480, maxWidth: "94vw", maxHeight: "88vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: "#111827", fontFamily: "'DM Sans', sans-serif" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#999", fontSize: 22, cursor: "pointer", padding: 4 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Btn = ({ children, onClick, variant = "primary", style = {}, disabled }) => {
  const styles = {
    primary: { background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff" },
    success: { background: "linear-gradient(135deg, #059669, #10b981)", color: "#fff" },
    danger: { background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff" },
    ghost: { background: "rgba(0,0,0,0.04)", color: "#374151", border: "1px solid #c0c8d8" },
    warning: { background: "linear-gradient(135deg, #d97706, #f59e0b)", color: "#fff" },
  };
  return (
    <button disabled={disabled} onClick={onClick} style={{ border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", ...styles[variant], ...style }}>{children}</button>
  );
};

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>}
    <input {...props} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none", ...props.style }} />
  </div>
);

const Select = ({ label, options, ...props }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>}
    <select {...props} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none", ...props.style }}>
      {options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}
    </select>
  </div>
);

const Badge = ({ children, color = "#2563eb" }) => (
  <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${color}22`, color, fontFamily: "'DM Sans', sans-serif" }}>{children}</span>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: "linear-gradient(145deg, #ffffff, #f8f9fc)", border: "1px solid #d4d8e0", borderRadius: 16, padding: 20, ...style }}>{children}</div>
);

const StatCard = ({ label, value, sub, color = "#2563eb" }) => (
  <Card style={{ flex: 1, minWidth: 140 }}>
    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "'DM Sans', sans-serif" }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{sub}</div>}
  </Card>
);

// ─── POS / Checkout ─────────────────────────────────────────────────

const POSTab = ({ products, setProducts, sales, setSales, customers, activeStaff }) => {
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [selCustomer, setSelCustomer] = useState("");
  const [showReceipt, setShowReceipt] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [payMethod, setPayMethod] = useState("cash"); // cash, card, mix
  const [cashAmount, setCashAmount] = useState("");
  const [imeiPicker, setImeiPicker] = useState(null);
  const [posCatFilter, setPosCatFilter] = useState("All");
  const [scanInput, setScanInput] = useState("");
  const [scanMsg, setScanMsg] = useState("");

  // Barcode scanner handler — scans IMEI, finds matching unit, adds to cart
  const handleScan = (value) => {
    const scanned = value.trim();
    if (!scanned) return;
    setScanInput("");
    // Find a product with a unit matching this IMEI
    for (const p of products) {
      if (!p.serialized) continue;
      const unit = (p.units || []).find(u => u.status === "in_stock" && u.imei === scanned && !cartUnitIds.has(u.id));
      if (unit) {
        addSerializedToCart(p, unit);
        setScanMsg(`✅ Added: ${p.name} — ${scanned}`);
        setTimeout(() => setScanMsg(""), 3000);
        return;
      }
    }
    // Check if it exists but is already sold or in cart
    for (const p of products) {
      if (!p.serialized) continue;
      const soldUnit = (p.units || []).find(u => u.imei === scanned);
      if (soldUnit) {
        if (soldUnit.status === "sold") { setScanMsg(`⚠️ ${scanned} — already sold`); }
        else if (cartUnitIds.has(soldUnit.id)) { setScanMsg(`⚠️ ${scanned} — already in cart`); }
        setTimeout(() => setScanMsg(""), 3000);
        return;
      }
    }
    setScanMsg(`❌ IMEI not found: ${scanned}`);
    setTimeout(() => setScanMsg(""), 3000);
  };

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    if (getStock(p) <= 0) return false;
    if (posCatFilter !== "All" && p.category !== posCatFilter) return false;
    if (p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)) return true;
    if (p.serialized && (p.units || []).some(u => u.status === "in_stock" && u.imei.toLowerCase().includes(s))) return true;
    return false;
  });

  // Group filtered products by category for display
  const groupedByCategory = filtered.reduce((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p);
    return acc;
  }, {});
  const categoryOrder = CATEGORIES.filter(c => groupedByCategory[c]);

  // Categories that have stock (for filter pills)
  const categoriesWithStock = CATEGORIES.filter(cat => products.some(p => p.category === cat && getStock(p) > 0));

  const cartUnitIds = new Set(cart.filter(c => c.unitId).map(c => c.unitId));

  const handleProductClick = (p) => {
    if (p.serialized) {
      const available = (p.units || []).filter(u => u.status === "in_stock" && !cartUnitIds.has(u.id));
      if (available.length === 0) return;
      if (available.length === 1) {
        addSerializedToCart(p, available[0]);
      } else {
        setImeiPicker(p);
      }
    } else {
      addNonSerializedToCart(p);
    }
  };

  const addSerializedToCart = (p, unit) => {
    setCart(prev => [...prev, { cartItemId: uid(), productId: p.id, name: p.name, price: unit.price ?? p.price ?? 0, cost: unit.cost ?? p.cost ?? 0, qty: 1, imei: unit.imei, unitId: unit.id, color: unit.color || "", storage: unit.storage || "", grade: unit.grade || "" }]);
    setImeiPicker(null);
  };

  const addNonSerializedToCart = (p) => {
    setCart(prev => {
      const exists = prev.find(c => c.productId === p.id && !c.unitId);
      if (exists) {
        if (exists.qty >= getStock(p)) return prev;
        return prev.map(c => c.cartItemId === exists.cartItemId ? { ...c, qty: c.qty + 1 } : c);
      }
      return [...prev, { cartItemId: uid(), productId: p.id, name: p.name, price: p.price, cost: p.cost ?? 0, qty: 1, imei: null, unitId: null }];
    });
  };

  const updateQty = (cartItemId, qty) => {
    if (qty < 1) return removeFromCart(cartItemId);
    setCart(prev => prev.map(c => {
      if (c.cartItemId !== cartItemId) return c;
      if (c.unitId) return c;
      const p = products.find(x => x.id === c.productId);
      if (qty > getStock(p)) return c;
      return { ...c, qty };
    }));
  };

  const removeFromCart = (cartItemId) => setCart(prev => prev.filter(c => c.cartItemId !== cartItemId));

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const discountAmt = discount;
  const total = subtotal - discountAmt;

  const checkout = () => {
    if (cart.length === 0) return;
    const sale = {
      id: uid(),
      items: cart.map(c => ({ productId: c.productId, name: c.name, qty: c.qty, price: c.price, cost: c.cost ?? 0, imei: c.imei || "", unitId: c.unitId || "", color: c.color || "", storage: c.storage || "", grade: c.grade || "" })),
      subtotal, discount, discountAmt, total,
      payment: payMethod,
      cashPaid: payMethod === "mix" ? (+cashAmount || 0) : (payMethod === "cash" ? total : 0),
      cardPaid: payMethod === "mix" ? (total - (+cashAmount || 0)) : (payMethod === "card" ? total : 0),
      customer: selCustomer || null,
      staff: activeStaff?.name || "",
      staffId: activeStaff?.id || "",
      date: new Date().toISOString()
    };
    setSales(prev => [...prev, sale]);
    setProducts(prev => prev.map(p => {
      const soldUnits = cart.filter(c => c.productId === p.id && c.unitId);
      if (soldUnits.length > 0) {
        const soldIds = new Set(soldUnits.map(c => c.unitId));
        return { ...p, units: p.units.map(u => soldIds.has(u.id) ? { ...u, status: "sold" } : u) };
      }
      const nonSerialized = cart.find(c => c.productId === p.id && !c.unitId);
      if (nonSerialized) return { ...p, stock: p.stock - nonSerialized.qty };
      return p;
    }));
    setShowReceipt(sale);
    setCart([]);
    setDiscount(0);
    setPayMethod("cash");
    setCashAmount("");
    setSelCustomer("");
  };

  const pickerUnits = imeiPicker ? (imeiPicker.units || []).filter(u => u.status === "in_stock" && !cartUnitIds.has(u.id)) : [];

  return (
    <div style={{ display: "flex", gap: 20, height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Barcode Scanner Input */}
        <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input placeholder="📷 Scan IMEI barcode here…" value={scanInput} onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleScan(scanInput); }}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid #3b82f6", background: "#ffffff", color: "#111827", fontSize: 15, fontFamily: "monospace", boxSizing: "border-box", outline: "none" }} />
          </div>
          {scanMsg && <div style={{ fontSize: 13, fontWeight: 600, color: scanMsg.startsWith("✅") ? "#10b981" : scanMsg.startsWith("⚠") ? "#f59e0b" : "#ef4444", whiteSpace: "nowrap" }}>{scanMsg}</div>}
        </div>
        <Input placeholder="Search by name, SKU, or IMEI/Serial…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 0 }} />

        {/* Category Filter Pills */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {["All", ...categoriesWithStock].map(cat => {
            const count = cat === "All" ? products.filter(p => getStock(p) > 0).length : (products.filter(p => p.category === cat && getStock(p) > 0).length);
            const active = posCatFilter === cat;
            return (
              <button key={cat} onClick={() => setPosCatFilter(cat)}
                style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${active ? "#3b82f6" : "#d4d8e0"}`, background: active ? "linear-gradient(135deg, #2563eb15, #3b82f622)" : "#ffffff", color: active ? "#2563eb" : "#7070a0", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", whiteSpace: "nowrap" }}>
                {cat} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: "auto", marginTop: 14 }}>
          {categoryOrder.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>No products found</div>}
          {categoryOrder.map(cat => (
            <div key={cat} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#2563eb", textTransform: "uppercase", letterSpacing: 1, fontFamily: "'DM Sans', sans-serif" }}>{cat}</h3>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{groupedByCategory[cat].length} products</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
                {groupedByCategory[cat].map(p => {
                  const stock = getStock(p);
                  const inCart = p.serialized ? cart.filter(c => c.productId === p.id).length : (cart.find(c => c.productId === p.id && !c.unitId)?.qty || 0);
                  const remaining = stock - inCart;
                  return (
                    <div key={p.id} onClick={() => remaining > 0 && handleProductClick(p)} style={{ background: "linear-gradient(145deg, #ffffff, #f8f9fc)", border: "1px solid #d4d8e0", borderRadius: 14, padding: 14, cursor: remaining > 0 ? "pointer" : "not-allowed", transition: "all 0.2s", display: "flex", flexDirection: "column", gap: 6, opacity: remaining <= 0 ? 0.4 : 1, minHeight: 120 }}
                      onMouseEnter={e => { if (remaining > 0) { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.transform = "translateY(-2px)"; }}}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "#d4d8e0"; e.currentTarget.style.transform = "none"; }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{p.sku}</div>
                      {p.serialized && <div style={{ fontSize: 10, color: "#f59e0b" }}>📋 Unique IMEI</div>}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                        {(() => {
                          if (p.serialized && (p.units || []).filter(u => u.status === "in_stock").length > 0) {
                            const inStock = p.units.filter(u => u.status === "in_stock");
                            const prices = inStock.map(u => u.price ?? p.price ?? 0);
                            const minP = Math.min(...prices);
                            const maxP = Math.max(...prices);
                            return minP === maxP
                              ? <span style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6" }}>{currency(minP)}</span>
                              : <span style={{ fontSize: 14, fontWeight: 800, color: "#3b82f6" }}>{currency(minP)}–{currency(maxP)}</span>;
                          }
                          return <span style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6" }}>{currency(p.price)}</span>;
                        })()}
                        <Badge color={stock < 5 ? "#ef4444" : "#10b981"}>{stock}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", background: "#ffffff", border: "1px solid #d4d8e0", borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>🛒 Cart ({cart.reduce((s, c) => s + c.qty, 0)})</div>
        <Select label="Customer (optional)" options={[{ value: "", label: "Walk-in Customer" }, ...customers.map(c => ({ value: c.id, label: c.name }))]} value={selCustomer} onChange={e => setSelCustomer(e.target.value)} />
        <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
          {cart.map(c => (
            <div key={c.cartItemId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                {(c.color || c.storage || c.grade) && <div style={{ fontSize: 11, color: "#2563eb", marginTop: 1 }}>{[c.color, c.storage, c.grade ? `Grade ${c.grade}` : ""].filter(Boolean).join(" · ")}</div>}
                {c.imei && <div style={{ fontSize: 10, color: "#f59e0b", fontFamily: "monospace", marginTop: 1 }}>IMEI/SN: {c.imei}</div>}
                <div style={{ fontSize: 12, color: "#3b82f6" }}>{currency(c.price)}</div>
              </div>
              {c.unitId ? (
                <button onClick={() => removeFromCart(c.cartItemId)} style={{ background: "none", border: "1px solid #c0c8d8", borderRadius: 8, color: "#ef4444", cursor: "pointer", fontSize: 12, padding: "4px 10px" }}>✕</button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => updateQty(c.cartItemId, c.qty - 1)} style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid #c0c8d8", background: "none", color: "#374151", cursor: "pointer", fontSize: 14 }}>−</button>
                  <span style={{ width: 24, textAlign: "center", fontSize: 14, color: "#111827", fontWeight: 700 }}>{c.qty}</span>
                  <button onClick={() => updateQty(c.cartItemId, c.qty + 1)} style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid #c0c8d8", background: "none", color: "#374151", cursor: "pointer", fontSize: 14 }}>+</button>
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", width: 64, textAlign: "right" }}>{currency(c.price * c.qty)}</div>
            </div>
          ))}
          {cart.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: 30, fontSize: 13 }}>Tap a product to add it</div>}
        </div>
        <Input label="Discount (£)" type="number" min={0} value={discount} onChange={e => setDiscount(Math.max(0, +e.target.value))} />

        {/* Payment Method */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Payment Method</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[["cash", "💵 Cash"], ["card", "💳 Card"], ["mix", "🔀 Split"]].map(([val, label]) => (
              <button key={val} onClick={() => { setPayMethod(val); if (val !== "mix") setCashAmount(""); }}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${payMethod === val ? "#2563eb" : "#d4d8e0"}`, background: payMethod === val ? "#2563eb15" : "transparent", color: payMethod === val ? "#2563eb" : "#6b7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</button>
            ))}
          </div>
          {payMethod === "mix" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <Input label="Cash (£)" type="number" min={0} value={cashAmount} onChange={e => setCashAmount(e.target.value)} style={{ marginBottom: 0 }} />
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Card (£)</label>
                <div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#f8f9fc", color: "#374151", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{currency(Math.max(0, total - (+cashAmount || 0)))}</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid #d4d8e0", paddingTop: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280", marginBottom: 4 }}><span>Subtotal</span><span>{currency(subtotal)}</span></div>
          {discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#ef4444", marginBottom: 4 }}><span>Discount</span><span>-{currency(discountAmt)}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800, color: "#111827", marginTop: 6 }}><span>Total</span><span>{currency(total)}</span></div>
        </div>
        <Btn onClick={checkout} disabled={cart.length === 0} variant="success" style={{ width: "100%", padding: "14px 0", fontSize: 16 }}>Complete Sale</Btn>
      </div>

      {/* IMEI Picker */}
      <Modal open={!!imeiPicker} onClose={() => setImeiPicker(null)} title={imeiPicker ? `Select Unit — ${imeiPicker.name}` : ""} wide>
        {imeiPicker && (
          <div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>Each unit has a unique IMEI/Serial. Pick the one you're selling:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 350, overflowY: "auto" }}>
              {pickerUnits.map(unit => (
                <div key={unit.id} onClick={() => addSerializedToCart(imeiPicker, unit)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#ffffff", border: "1px solid #d4d8e0", borderRadius: 12, cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.background = "#eef2ff"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#d4d8e0"; e.currentTarget.style.background = "#ffffff"; }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f59e0b", fontFamily: "monospace" }}>{unit.imei}</div>
                    <div style={{ fontSize: 12, color: "#2563eb", marginTop: 3 }}>{[unit.color, unit.storage, unit.grade ? `Grade ${unit.grade}` : ""].filter(Boolean).join(" · ") || "No variant info"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{currency(unit.price ?? imeiPicker.price ?? 0)}</div>
                    <Btn variant="primary" style={{ padding: "6px 16px", fontSize: 13 }}>Select</Btn>
                  </div>
                </div>
              ))}
              {pickerUnits.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: 20 }}>All units are already in cart or sold</div>}
            </div>
          </div>
        )}
      </Modal>

      {/* Receipt */}
      <Modal open={!!showReceipt} onClose={() => setShowReceipt(null)} title="Receipt">
        {showReceipt && (
          <div style={{ fontFamily: "'Courier New', monospace", color: "#374151", fontSize: 13 }}>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>📱 PHONE SHOP</div>
              <div style={{ color: "#6b7280", fontSize: 11 }}>{new Date(showReceipt.date).toLocaleString()}</div>
              <div style={{ color: "#6b7280", fontSize: 11 }}>Receipt #{showReceipt.id.toUpperCase()}</div>
            </div>
            <div style={{ borderTop: "1px dashed #c0c8d8", borderBottom: "1px dashed #c0c8d8", padding: "10px 0", margin: "10px 0" }}>
              {showReceipt.items.map((item, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{item.qty}x {item.name}</span>
                    <span>{currency(item.price * item.qty)}</span>
                  </div>
                  {item.imei && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2, paddingLeft: 12 }}>┗ IMEI/SN: {item.imei}</div>}
                  {(item.color || item.storage || item.grade) && <div style={{ fontSize: 11, color: "#2563eb", paddingLeft: 12 }}>┗ {[item.color, item.storage, item.grade ? `Grade ${item.grade}` : ""].filter(Boolean).join(" · ")}</div>}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal:</span><span>{currency(showReceipt.subtotal)}</span></div>
            {showReceipt.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#ef4444" }}><span>Discount:</span><span>-{currency(showReceipt.discountAmt)}</span></div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, color: "#10b981", marginTop: 8 }}><span>TOTAL:</span><span>{currency(showReceipt.total)}</span></div>
            {showReceipt.payment && <div style={{ marginTop: 6, fontSize: 12, color: "#374151" }}>💳 Paid: {showReceipt.payment === "mix" ? `Cash ${currency(showReceipt.cashPaid || 0)} + Card ${currency(showReceipt.cardPaid || 0)}` : showReceipt.payment === "card" ? "Card" : "Cash"}</div>}
            {showReceipt.customer && <div style={{ marginTop: 10, color: "#6b7280", fontSize: 11 }}>Customer: {customers.find(c => c.id === showReceipt.customer)?.name || "N/A"}</div>}
            <div style={{ textAlign: "center", marginTop: 16, color: "#9ca3af", fontSize: 11 }}>Thank you for your purchase!</div>
            {(() => {
              const cust = customers.find(c => c.id === showReceipt.customer);
              const params = { type: "sale", data: showReceipt, customer: cust };
              return (
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap", fontFamily: "'DM Sans', sans-serif" }}>
                  <Btn variant="primary" onClick={() => printReceipt(params)}>🖨 Print / PDF</Btn>
                  <Btn variant="success" onClick={() => sendWhatsApp(params, cust?.phone)}>💬 WhatsApp</Btn>
                  <Btn variant="warning" onClick={() => sendEmail(params, cust?.email)}>✉ Email</Btn>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── Inventory ──────────────────────────────────────────────────────

const InventoryTab = ({ products, setProducts, deletionLogs, setDeletionLogs, user }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [unitsModal, setUnitsModal] = useState(null);
  const [newImei, setNewImei] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newStorage, setNewStorage] = useState("");
  const [newUnitCost, setNewUnitCost] = useState("");
  const [newUnitPrice, setNewUnitPrice] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [importModal, setImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // { products, errors } or null
  const [importError, setImportError] = useState("");
  const blank = { name: "", category: "Smartphones", price: "", cost: "", stock: "", sku: "", serialized: true, units: [] };
  const [form, setForm] = useState(blank);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (rows.length === 0) { setImportError("The spreadsheet is empty."); return; }
        const result = parseExcelRows(rows);
        setImportPreview(result);
      } catch (err) {
        setImportError("Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; // reset so same file can be re-uploaded
  };

  const confirmImport = () => {
    if (!importPreview) return;
    // Check IMEI duplicates against existing inventory
    const existingImeis = new Set();
    products.forEach(p => (p.units || []).forEach(u => existingImeis.add(u.imei)));
    const dupes = [];
    importPreview.products.forEach(p => p.units.forEach(u => { if (existingImeis.has(u.imei)) dupes.push(u.imei); }));
    if (dupes.length > 0) {
      if (!confirm(`${dupes.length} IMEI(s) already exist in inventory and will be skipped:\n${dupes.slice(0, 5).join("\n")}${dupes.length > 5 ? "\n…" : ""}\n\nContinue?`)) return;
    }
    // Merge with existing products by SKU; new SKUs become new products
    setProducts(prev => {
      const next = [...prev];
      importPreview.products.forEach(imported => {
        const cleanUnits = imported.units.filter(u => !existingImeis.has(u.imei));
        const existingIdx = next.findIndex(p => p.sku.toUpperCase() === imported.sku.toUpperCase());
        if (existingIdx >= 0) {
          // Merge into existing product
          const ex = next[existingIdx];
          if (imported.serialized) {
            next[existingIdx] = { ...ex, units: [...(ex.units || []), ...cleanUnits], serialized: true };
          } else {
            next[existingIdx] = { ...ex, stock: (ex.stock || 0) + imported.stock };
          }
        } else {
          // New product
          next.push({ ...imported, id: uid(), units: cleanUnits });
        }
      });
      return next;
    });
    setImportPreview(null);
    setImportModal(false);
  };

  const openAdd = () => { setForm(blank); setEditing(null); setShowModal(true); };
  const openEdit = (p) => {
    setForm({ ...p, price: String(p.price), cost: String(p.cost), stock: String(p.stock || 0) });
    setEditing(p.id);
    setShowModal(true);
  };
  const save = () => {
    const isSerialized = SERIALIZED_CATEGORIES.includes(form.category) || form.serialized;
    const item = { ...form, price: +form.price, cost: +form.cost, stock: isSerialized ? 0 : (+form.stock || 0), serialized: isSerialized, units: form.units || [] };
    if (!item.name || !item.price) return;
    if (editing) { setProducts(prev => prev.map(p => p.id === editing ? { ...p, ...item } : p)); }
    else { setProducts(prev => [...prev, { ...item, id: uid() }]); }
    setShowModal(false);
  };
  // ─── Deletion Audit System ──────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState(null); // { type: "product"|"unit", target: obj, productName?: string }
  const [deleteReason, setDeleteReason] = useState("");
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [showStockAlertModal, setShowStockAlertModal] = useState(false);

  // Low stock = 1-4 items, Out of stock = 0
  const lowStockItems = products.filter(p => { const s = getStock(p); return s > 0 && s < 5; });
  const outOfStockItems = products.filter(p => getStock(p) === 0);
  const stockAlertCount = lowStockItems.length + outOfStockItems.length;

  const askDeleteProduct = (product) => {
    setDeleteModal({ type: "product", target: product });
    setDeleteReason("");
  };
  const askDeleteUnit = (product, unit) => {
    setDeleteModal({ type: "unit", target: unit, productName: product.name, productId: product.id });
    setDeleteReason("");
  };

  const confirmDelete = () => {
    if (!deleteReason.trim()) { alert("You must enter a reason for deletion"); return; }
    if (deleteReason.trim().length < 5) { alert("Please provide a more detailed reason (at least 5 characters)"); return; }

    const log = {
      id: uid(),
      type: deleteModal.type,
      date: new Date().toISOString(),
      user: activeStaff?.name || user?.email || "Unknown",
      staffId: activeStaff?.id || "",
      reason: deleteReason.trim(),
    };

    if (deleteModal.type === "product") {
      const p = deleteModal.target;
      log.item = {
        name: p.name, sku: p.sku, category: p.category,
        cost: p.cost, price: p.price,
        serialized: p.serialized,
        unitCount: (p.units || []).length,
        inStockUnits: (p.units || []).filter(u => u.status === "in_stock").length,
        stock: p.stock || 0,
      };
      setProducts(prev => prev.filter(x => x.id !== p.id));
    } else {
      const u = deleteModal.target;
      log.item = {
        productName: deleteModal.productName,
        imei: u.imei, color: u.color, storage: u.storage, grade: u.grade,
        cost: u.cost, price: u.price, supplier: u.supplier, status: u.status,
      };
      setProducts(prev => prev.map(p => p.id === deleteModal.productId ? { ...p, units: (p.units || []).filter(x => x.id !== u.id) } : p));
    }

    setDeletionLogs(prev => [log, ...prev]);
    setDeleteModal(null);
    setDeleteReason("");
  };

  const exportLogs = () => {
    const rows = deletionLogs.map(l => ({
      Date: new Date(l.date).toLocaleString("en-GB"),
      "Deleted By": l.user,
      Type: l.type === "product" ? "Product" : "Unit (Phone)",
      Item: l.type === "product" ? l.item.name : `${l.item.productName} — IMEI ${l.item.imei}`,
      Details: l.type === "product"
        ? `SKU: ${l.item.sku}, ${l.item.unitCount} units (${l.item.inStockUnits} in stock), Qty: ${l.item.stock}`
        : `${[l.item.color, l.item.storage, l.item.grade ? `Grade ${l.item.grade}` : ""].filter(Boolean).join(" · ")}, Cost: £${l.item.cost}, Price: £${l.item.price}, Supplier: ${l.item.supplier || "—"}, Status: ${l.item.status}`,
      Reason: l.reason,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 14 }, { wch: 40 }, { wch: 60 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Deletion Log");
    XLSX.writeFile(wb, `deletion-log-${today()}.xlsx`);
  };

  const addUnit = (productId) => {
    if (!newImei.trim()) { alert("IMEI / Serial Number is required"); return; }
    if (!newUnitCost.trim() || +newUnitCost <= 0) { alert("Cost is required and must be greater than 0"); return; }
    if (!newUnitPrice.trim() || +newUnitPrice <= 0) { alert("Sell Price is required and must be greater than 0"); return; }
    const isDuplicate = products.some(p => (p.units || []).some(u => u.imei === newImei.trim()));
    if (isDuplicate) { alert("This IMEI/Serial already exists in inventory!"); return; }
    const product = products.find(p => p.id === productId);
    const unitCost = +newUnitCost;
    const unitPrice = +newUnitPrice;
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, units: [...(p.units || []), { id: uid(), imei: newImei.trim(), color: newColor.trim(), storage: newStorage.trim(), cost: unitCost, price: unitPrice, supplier: newSupplier.trim(), grade: newGrade, status: "in_stock" }] } : p));
    setNewImei("");
    setNewColor("");
    setNewStorage("");
    setNewUnitCost("");
    setNewUnitPrice("");
    setNewSupplier("");
    setNewGrade("");
  };

  const filtered = products.filter(p =>
    (catFilter === "All" || p.category === catFilter) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()) || (p.units || []).some(u => u.imei.toLowerCase().includes(search.toLowerCase())))
  );

  const totalValue = products.reduce((s, p) => s + p.price * getStock(p), 0);
  const lowStock = products.filter(p => { const s = getStock(p); return s > 0 && s < 5; }).length;
  const outOfStock = products.filter(p => getStock(p) === 0).length;
  const currentUnitsProduct = unitsModal ? products.find(p => p.id === unitsModal.id) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Total Products" value={products.length} color="#2563eb" />
        <StatCard label="Total Stock Value" value={currency(totalValue)} color="#10b981" />
        <StatCard label="Low Stock" value={lowStock} color="#f59e0b" sub="Below 5 units" />
        <StatCard label="Out of Stock" value={outOfStock} color="#ef4444" />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}><Input placeholder="Search by name, SKU, or IMEI…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 0 }} /></div>
        <Select options={["All", ...CATEGORIES]} value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 160, marginBottom: 0 }} />
        <Btn variant="ghost" onClick={() => setShowStockAlertModal(true)}>⚠️ Stock Alerts {stockAlertCount > 0 && <span style={{ background: outOfStockItems.length > 0 ? "#ef4444" : "#f59e0b", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, marginLeft: 4 }}>{stockAlertCount}</span>}</Btn>
        <Btn variant="ghost" onClick={() => setShowLogsModal(true)}>📋 Deletion Log {deletionLogs.length > 0 && <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, marginLeft: 4 }}>{deletionLogs.length}</span>}</Btn>
        <Btn variant="warning" onClick={() => { setImportPreview(null); setImportError(""); setImportModal(true); }}>📥 Import Excel</Btn>
        <Btn onClick={openAdd}>+ Add Product</Btn>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #d4d8e0", color: "#6b7280", textAlign: "left" }}>
              <th style={{ padding: "10px 8px" }}>SKU</th><th style={{ padding: "10px 8px" }}>Product</th><th style={{ padding: "10px 8px" }}>Type</th><th style={{ padding: "10px 8px" }}>Category</th>
              <th style={{ padding: "10px 8px", textAlign: "right" }}>Cost</th><th style={{ padding: "10px 8px", textAlign: "right" }}>Price</th>
              <th style={{ padding: "10px 8px", textAlign: "right" }}>Qty</th><th style={{ padding: "10px 8px", textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const stock = getStock(p);
              return (
                <tr key={p.id} style={{ borderBottom: "1px solid #e5e7eb", color: "#374151" }}>
                  <td style={{ padding: "10px 8px", fontFamily: "monospace", color: "#3b82f6" }}>{p.sku}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 600, color: "#111827" }}>
                    {p.serialized ? (
                      <button onClick={() => { setUnitsModal(p); setNewImei(""); setNewColor(""); setNewStorage(""); setNewUnitCost(""); setNewUnitPrice(""); setNewSupplier(""); setNewGrade(""); }}
                        style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 700, textAlign: "left", textDecoration: "underline", textDecorationColor: "transparent", fontFamily: "'DM Sans', sans-serif" }}
                        onMouseEnter={e => e.currentTarget.style.textDecorationColor = "#2563eb"}
                        onMouseLeave={e => e.currentTarget.style.textDecorationColor = "transparent"}
                        title="Click to manage units">
                        {p.name} 📱
                      </button>
                    ) : p.name}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    {p.serialized ? <Badge color="#f59e0b">Serialized</Badge> : <Badge color="#6b7280">Generic</Badge>}
                  </td>
                  <td style={{ padding: "10px 8px" }}><Badge>{p.category}</Badge></td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{currency(p.cost)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700 }}>{currency(p.price)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    <Badge color={stock === 0 ? "#ef4444" : stock < 5 ? "#f59e0b" : "#10b981"}>{stock}</Badge>
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                    {p.serialized && <button onClick={() => { setUnitsModal(p); setNewImei(""); setNewColor(""); setNewStorage(""); setNewUnitCost(""); setNewUnitPrice(""); setNewSupplier(""); setNewGrade(""); }}
                      style={{ background: "#f59e0b", border: "none", color: "#fff", cursor: "pointer", marginRight: 6, fontSize: 13, fontWeight: 700, padding: "8px 16px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif" }}>📱 Units</button>}
                    <button onClick={() => openEdit(p)} style={{ background: "#2563eb15", border: "1px solid #2563eb", color: "#2563eb", cursor: "pointer", marginRight: 6, fontSize: 12, padding: "6px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Edit</button>
                    <button onClick={() => askDeleteProduct(p)} style={{ background: "transparent", border: "1px solid #ef4444", color: "#ef4444", cursor: "pointer", fontSize: 12, padding: "6px 12px", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Product" : "Add Product"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <div style={{ gridColumn: "1/-1" }}><Input label="Product Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <Input label="SKU" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
          <Select label="Category" options={CATEGORIES} value={form.category} onChange={e => {
            const cat = e.target.value;
            setForm({ ...form, category: cat, serialized: SERIALIZED_CATEGORIES.includes(cat) });
          }} />
          <Input label={form.serialized || SERIALIZED_CATEGORIES.includes(form.category) ? "Default Unit Cost (£)" : "Cost Price (£)"} type="number" min={0} value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
          <Input label={form.serialized || SERIALIZED_CATEGORIES.includes(form.category) ? "Default Sell Price (£)" : "Selling Price (£)"} type="number" min={0} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
          {!(SERIALIZED_CATEGORIES.includes(form.category) || form.serialized) && (
            <Input label="Quantity" type="number" min={0} value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
          )}
        </div>
        {(SERIALIZED_CATEGORIES.includes(form.category) || form.serialized) && (
          <div style={{ background: "#ffffff", borderRadius: 10, padding: 14, marginTop: 4, border: "1px solid #d4d8e0" }}>
            <div style={{ fontSize: 12, color: "#f59e0b", marginBottom: 0 }}>⚠️ Serialized product — stock is managed per unit. {editing ? 'Use the "Units" button in the table to add/remove individual IMEIs.' : 'After creating, use the "Units" button to add each device with its IMEI.'}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
          <Btn onClick={save}>{editing ? "Save Changes" : "Add Product"}</Btn>
        </div>
      </Modal>

      <Modal wide open={!!unitsModal} onClose={() => setUnitsModal(null)} title={currentUnitsProduct ? `Manage Units — ${currentUnitsProduct.name}` : ""}>
        {currentUnitsProduct && (
          <div>
            {/* Stock summary banner */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, padding: "10px 14px", background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, alignItems: "center" }}>
              <Badge color="#10b981">{currentUnitsProduct.units.filter(u => u.status === "in_stock").length} in stock</Badge>
              <Badge color="#f59e0b">{currentUnitsProduct.units.filter(u => u.status === "reserved").length} reserved</Badge>
              <Badge color="#6b7280">{currentUnitsProduct.units.filter(u => u.status === "sold").length} sold</Badge>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>{currentUnitsProduct.units.length} total units</span>
            </div>

            {/* Add new unit form — sectioned for clarity */}
            <div style={{ background: "#eef2ff", border: "1px solid #2563eb40", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>➕ Add New Unit</div>

              {/* Row 1: IMEI (full width) */}
              <Input label="IMEI / Serial Number *" placeholder="e.g. 353456789012350" value={newImei} onChange={e => setNewImei(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { document.getElementById("unit-color-input")?.focus(); } }} />

              {/* Row 2: Colour, Storage, Grade — 3 equal columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
                <Input label="Colour" placeholder="e.g. Black" value={newColor} onChange={e => setNewColor(e.target.value)} id="unit-color-input" />
                <Input label="Storage" placeholder="e.g. 256GB" value={newStorage} onChange={e => setNewStorage(e.target.value)} />
                <Select label="Grade" options={[{ value: "", label: "Select grade…" }, ...GRADES.map(g => ({ value: g, label: `Grade ${g}` }))]} value={newGrade} onChange={e => setNewGrade(e.target.value)} />
              </div>

              {/* Row 3: Cost, Price, Supplier — 3 equal columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
                <Input label="Cost (£) *" type="number" min={0} placeholder={`Default: ${currency(currentUnitsProduct.cost || 0)}`} value={newUnitCost} onChange={e => setNewUnitCost(e.target.value)} />
                <Input label="Sell Price (£) *" type="number" min={0} placeholder={`Default: ${currency(currentUnitsProduct.price || 0)}`} value={newUnitPrice} onChange={e => setNewUnitPrice(e.target.value)} />
                <Input label="Supplier" placeholder="e.g. WeBuy" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                <Btn onClick={() => addUnit(currentUnitsProduct.id)} variant="success" style={{ padding: "10px 24px", fontSize: 14 }}>➕ Add Unit to Stock</Btn>
              </div>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #d4d8e0", color: "#6b7280", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>#</th>
                    <th style={{ padding: "8px" }}>IMEI / Serial</th>
                    <th style={{ padding: "8px" }}>Colour</th>
                    <th style={{ padding: "8px" }}>Storage</th>
                    <th style={{ padding: "8px" }}>Grade</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Cost</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Sell Price</th>
                    <th style={{ padding: "8px" }}>Supplier</th>
                    <th style={{ padding: "8px" }}>Status</th>
                    <th style={{ padding: "8px", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {currentUnitsProduct.units.map((u, i) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px", color: "#9ca3af" }}>{i + 1}</td>
                      <td style={{ padding: "8px", fontFamily: "monospace", color: "#f59e0b", fontWeight: 700, fontSize: 14 }}>{u.imei}</td>
                      <td style={{ padding: "8px", color: "#2563eb" }}>{u.color || "—"}</td>
                      <td style={{ padding: "8px", color: "#374151", fontWeight: 600 }}>{u.storage || "—"}</td>
                      <td style={{ padding: "8px" }}>{u.grade ? <Badge color={u.grade === "A" ? "#10b981" : u.grade === "B" ? "#3b82f6" : u.grade === "C" ? "#f59e0b" : "#ef4444"}>Grade {u.grade}</Badge> : "—"}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{currency(u.cost ?? currentUnitsProduct.cost ?? 0)}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#10b981", fontWeight: 700 }}>{currency(u.price ?? currentUnitsProduct.price ?? 0)}</td>
                      <td style={{ padding: "8px", color: "#6b7280" }}>{u.supplier || "—"}</td>
                      <td style={{ padding: "8px" }}>
                        {u.status === "in_stock" ? <Badge color="#10b981">In Stock</Badge> : <Badge color="#6b7280">Sold</Badge>}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        {u.status === "in_stock" ? (
                          <button onClick={() => askDeleteUnit(currentUnitsProduct, u)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>Remove</button>
                        ) : <span style={{ color: "#9ca3af", fontSize: 11 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                  {currentUnitsProduct.units.length === 0 && (
                    <tr><td colSpan={10} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>No units yet. Add IMEI/Serial numbers above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Excel Import Modal */}
      <Modal wide open={importModal} onClose={() => setImportModal(false)} title="Import Products from Excel">
        {!importPreview ? (
          <div>
            <div style={{ background: "#ffffff", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #d4d8e0" }}>
              <div style={{ fontSize: 13, color: "#374151", fontWeight: 600, marginBottom: 8 }}>📋 How it works</div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
                Upload an Excel file (.xlsx) with columns: <span style={{ color: "#2563eb" }}>Name, SKU, Category, Cost, Price, Stock, IMEI, Colour, Storage, Unit Cost</span>.<br/>
                • For <strong>generic products</strong> (cases, cables, etc.) — fill in <span style={{ color: "#10b981" }}>Stock</span>, leave IMEI blank.<br/>
                • For <strong>serialized devices</strong> (phones, AirPods) — one row per physical unit with its <span style={{ color: "#f59e0b" }}>IMEI</span>, Colour, and Storage. Leave Stock blank.<br/>
                • Multiple rows with the same SKU are merged into one product with multiple units.<br/>
                • Existing products (matched by SKU) get new units added; duplicate IMEIs are skipped.<br/>
                • <span style={{ color: "#10b981" }}>Unit Cost</span> lets each phone have its own cost (since you may pay different prices for the same model). Leave blank to use the default Cost.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <Btn variant="ghost" onClick={downloadTemplate}>⬇️ Download Template</Btn>
            </div>
            <div style={{ border: "2px dashed #d4d8e0", borderRadius: 12, padding: 30, textAlign: "center", background: "#f5f7fa" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: 14, color: "#374151", marginBottom: 14 }}>Choose an Excel file to import</div>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
                style={{ display: "block", margin: "0 auto", color: "#6b7280", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            {importError && <div style={{ marginTop: 14, padding: 12, background: "#dc262615", border: "1px solid #ef4444", borderRadius: 10, color: "#ef4444", fontSize: 13 }}>⚠️ {importError}</div>}
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Badge color="#10b981">{importPreview.products.length} products</Badge>
              <Badge color="#f59e0b">{importPreview.products.reduce((t, p) => t + (p.serialized ? p.units.length : p.stock), 0)} total units</Badge>
              {importPreview.errors.length > 0 && <Badge color="#ef4444">{importPreview.errors.length} errors</Badge>}
            </div>
            {importPreview.errors.length > 0 && (
              <div style={{ background: "#ef444411", border: "1px solid #ef4444", borderRadius: 10, padding: 12, marginBottom: 14, maxHeight: 100, overflowY: "auto" }}>
                {importPreview.errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: "#ef4444" }}>• {e}</div>)}
              </div>
            )}
            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #d4d8e0", borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: "#ffffff", position: "sticky", top: 0 }}>
                  <tr style={{ color: "#6b7280", textAlign: "left" }}>
                    <th style={{ padding: "10px 8px" }}>SKU</th>
                    <th style={{ padding: "10px 8px" }}>Name</th>
                    <th style={{ padding: "10px 8px" }}>Type</th>
                    <th style={{ padding: "10px 8px", textAlign: "right" }}>Price</th>
                    <th style={{ padding: "10px 8px", textAlign: "right" }}>Units/Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.products.map((p, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px", fontFamily: "monospace", color: "#3b82f6" }}>{p.sku}</td>
                      <td style={{ padding: "8px", color: "#111827", fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: "8px" }}>{p.serialized ? <Badge color="#f59e0b">Serialized</Badge> : <Badge color="#6b7280">Generic</Badge>}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#374151" }}>{currency(p.price)}</td>
                      <td style={{ padding: "8px", textAlign: "right", color: "#10b981", fontWeight: 700 }}>{p.serialized ? p.units.length : p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <Btn variant="ghost" onClick={() => setImportPreview(null)}>← Back</Btn>
              <Btn variant="success" onClick={confirmImport}>Import {importPreview.products.length} Products</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Reason Modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title={deleteModal?.type === "product" ? "Delete Product" : "Delete Unit from Stock"}>
        {deleteModal && (
          <div>
            <div style={{ background: "#fef2f2", border: "1px solid #ef4444", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>⚠️ You are about to delete:</div>
              {deleteModal.type === "product" ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{deleteModal.target.name}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>SKU: {deleteModal.target.sku} · {deleteModal.target.category}</div>
                  {deleteModal.target.serialized ? (
                    <div style={{ fontSize: 12, color: "#991b1b", marginTop: 4, fontWeight: 600 }}>
                      ⚠ This will delete {(deleteModal.target.units || []).length} units including {(deleteModal.target.units || []).filter(u => u.status === "in_stock").length} in stock
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#991b1b", marginTop: 4, fontWeight: 600 }}>⚠ Current quantity: {deleteModal.target.stock || 0}</div>
                  )}
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, color: "#111827" }}><strong>{deleteModal.productName}</strong></div>
                  <div style={{ fontSize: 13, color: "#f59e0b", fontFamily: "monospace", marginTop: 4 }}>IMEI: {deleteModal.target.imei}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{[deleteModal.target.color, deleteModal.target.storage, deleteModal.target.grade ? `Grade ${deleteModal.target.grade}` : ""].filter(Boolean).join(" · ")}</div>
                  <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>Cost: {currency(deleteModal.target.cost || 0)} · Price: {currency(deleteModal.target.price || 0)}</div>
                </div>
              )}
            </div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Reason for deletion (required) *</label>
            <textarea
              placeholder="e.g. Damaged during handling, sent back to supplier, duplicate entry, faulty unit returned to wholesaler…"
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              autoFocus
              rows={3}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none", resize: "vertical" }}
            />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>This action will be logged and visible to the owner. Please be specific.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <Btn variant="ghost" onClick={() => setDeleteModal(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={confirmDelete}>🗑 Delete & Log</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Deletion Logs Modal */}
      <Modal wide open={showLogsModal} onClose={() => setShowLogsModal(false)} title="📋 Deletion History Log">
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>All inventory deletions recorded with reason, date, and staff member.</div>
          {deletionLogs.length > 0 && <Btn variant="ghost" onClick={exportLogs}>⬇ Export to Excel</Btn>}
        </div>
        {deletionLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>No deletions recorded yet.</div>
        ) : (
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {deletionLogs.map(log => (
              <div key={log.id} style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <Badge color={log.type === "product" ? "#dc2626" : "#f59e0b"}>{log.type === "product" ? "Product Deleted" : "Unit Deleted"}</Badge>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginLeft: 10 }}>
                      {log.type === "product" ? log.item.name : log.item.productName}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "right" }}>
                    {new Date(log.date).toLocaleString("en-GB")}<br />
                    by <span style={{ color: "#2563eb", fontWeight: 600 }}>{log.user}</span>
                  </div>
                </div>
                {log.type === "product" ? (
                  <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
                    SKU: <strong>{log.item.sku}</strong> · {log.item.category} · {log.item.serialized ? `${log.item.unitCount} units (${log.item.inStockUnits} in stock)` : `Qty: ${log.item.stock}`} · Cost: {currency(log.item.cost)} · Price: {currency(log.item.price)}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>
                    IMEI: <span style={{ color: "#f59e0b", fontFamily: "monospace", fontWeight: 700 }}>{log.item.imei}</span>
                    {" · "}{[log.item.color, log.item.storage, log.item.grade ? `Grade ${log.item.grade}` : ""].filter(Boolean).join(" · ")}
                    {" · "}Cost: {currency(log.item.cost || 0)} · Price: {currency(log.item.price || 0)}
                    {log.item.supplier ? ` · Supplier: ${log.item.supplier}` : ""}
                    {" · Status: "}<strong>{log.item.status}</strong>
                  </div>
                )}
                <div style={{ background: "#ffffff", border: "1px solid #d4d8e0", borderRadius: 8, padding: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Reason</div>
                  <div style={{ fontSize: 13, color: "#111827" }}>{log.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Stock Alerts Modal */}
      <Modal wide open={showStockAlertModal} onClose={() => setShowStockAlertModal(false)} title="⚠️ Stock Alerts — Items to Reorder">
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <StatCard label="Out of Stock" value={outOfStockItems.length} color="#ef4444" sub="Need urgent reorder" />
          <StatCard label="Low Stock" value={lowStockItems.length} color="#f59e0b" sub="Less than 5 left" />
          <StatCard label="Total Affected" value={stockAlertCount} color="#2563eb" />
        </div>

        {stockAlertCount === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#10b981" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>All products are well stocked!</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>No items are out of stock or running low.</div>
          </div>
        ) : (
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {outOfStockItems.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, color: "#ef4444", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>🔴 Out of Stock — {outOfStockItems.length} item{outOfStockItems.length === 1 ? "" : "s"}</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: "#fef2f2", border: "1px solid #ef4444", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "#fee2e2", color: "#991b1b", textAlign: "left" }}>
                      <th style={{ padding: "10px 8px" }}>Product</th>
                      <th style={{ padding: "10px 8px" }}>SKU</th>
                      <th style={{ padding: "10px 8px" }}>Category</th>
                      <th style={{ padding: "10px 8px", textAlign: "right" }}>Cost</th>
                      <th style={{ padding: "10px 8px", textAlign: "right" }}>Sell Price</th>
                      <th style={{ padding: "10px 8px", textAlign: "center" }}>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outOfStockItems.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #fecaca" }}>
                        <td style={{ padding: "10px 8px", color: "#111827", fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: "10px 8px", color: "#6b7280", fontFamily: "monospace", fontSize: 12 }}>{p.sku}</td>
                        <td style={{ padding: "10px 8px" }}><Badge>{p.category}</Badge></td>
                        <td style={{ padding: "10px 8px", textAlign: "right", color: "#374151" }}>{currency(p.cost)}</td>
                        <td style={{ padding: "10px 8px", textAlign: "right", color: "#111827", fontWeight: 700 }}>{currency(p.price)}</td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}><Badge color="#ef4444">0</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {lowStockItems.length > 0 && (
              <div>
                <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>🟡 Low Stock — {lowStockItems.length} item{lowStockItems.length === 1 ? "" : "s"} (less than 5 left)</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 10, overflow: "hidden" }}>
                  <thead>
                    <tr style={{ background: "#fef3c7", color: "#92400e", textAlign: "left" }}>
                      <th style={{ padding: "10px 8px" }}>Product</th>
                      <th style={{ padding: "10px 8px" }}>SKU</th>
                      <th style={{ padding: "10px 8px" }}>Category</th>
                      <th style={{ padding: "10px 8px", textAlign: "right" }}>Cost</th>
                      <th style={{ padding: "10px 8px", textAlign: "right" }}>Sell Price</th>
                      <th style={{ padding: "10px 8px", textAlign: "center" }}>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockItems.sort((a, b) => getStock(a) - getStock(b)).map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #fde68a" }}>
                        <td style={{ padding: "10px 8px", color: "#111827", fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: "10px 8px", color: "#6b7280", fontFamily: "monospace", fontSize: 12 }}>{p.sku}</td>
                        <td style={{ padding: "10px 8px" }}><Badge>{p.category}</Badge></td>
                        <td style={{ padding: "10px 8px", textAlign: "right", color: "#374151" }}>{currency(p.cost)}</td>
                        <td style={{ padding: "10px 8px", textAlign: "right", color: "#111827", fontWeight: 700 }}>{currency(p.price)}</td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}><Badge color="#f59e0b">{getStock(p)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <Btn variant="ghost" onClick={() => setShowStockAlertModal(false)}>Close</Btn>
        </div>
      </Modal>
    </div>
  );
};

const SalesHistoryTab = ({ sales, setSales, products, setProducts, customers, activeStaff }) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());

  const now = new Date();
  const filterDate = (d) => {
    if (dateFilter === "all") return true;
    if (!d) return false;
    const date = new Date(d);
    if (dateFilter === "today") {
      return date.getFullYear() === now.getFullYear()
          && date.getMonth() === now.getMonth()
          && date.getDate() === now.getDate();
    }
    if (dateFilter === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return date.getFullYear() === y.getFullYear()
          && date.getMonth() === y.getMonth()
          && date.getDate() === y.getDate();
    }
    if (dateFilter === "week") {
      const startOfWeek = new Date(now);
      const dayOfWeek = startOfWeek.getDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startOfWeek.setDate(now.getDate() - daysFromMonday);
      startOfWeek.setHours(0, 0, 0, 0);
      return date >= startOfWeek && date <= now;
    }
    if (dateFilter === "month") {
      return date.getFullYear() === now.getFullYear()
          && date.getMonth() === now.getMonth();
    }
    if (dateFilter === "custom") {
      if (!customFrom || !customTo) return false;
      const start = new Date(customFrom + "T00:00:00");
      const end = new Date(customTo + "T23:59:59");
      return date >= start && date <= end;
    }
    return true;
  };

  const filtered = sales.filter(s => {
    if (!filterDate(s.date)) return false;
    if (statusFilter === "active" && s.refunded) return false;
    if (statusFilter === "refunded" && !s.refunded) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (s.id.toLowerCase().includes(q)) return true;
    const cust = customers.find(c => c.id === s.customer);
    if (cust && cust.name.toLowerCase().includes(q)) return true;
    if (cust && cust.phone && cust.phone.includes(search)) return true;
    if (s.items.some(i => i.name.toLowerCase().includes(q) || (i.imei && i.imei.toLowerCase().includes(q)))) return true;
    return false;
  }).slice().reverse();

  // ─── Partial Refund System ──────────────────────────
  const [refundModal, setRefundModal] = useState(null); // sale being refunded
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [refundItems, setRefundItems] = useState([]); // unit IDs to return to stock
  const [refundReason, setRefundReason] = useState("");

  const openRefund = (sale) => {
    const alreadyRefunded = (sale.refunds || []).reduce((t, r) => t + r.amount, 0);
    const remaining = sale.total - alreadyRefunded;
    setRefundModal(sale);
    setRefundAmount(String(remaining.toFixed(2)));
    setRefundMethod("cash");
    setRefundItems([]);
    setRefundReason("");
  };

  const getRefundedTotal = (sale) => (sale.refunds || []).reduce((t, r) => t + r.amount, 0);

  const processRefund = () => {
    if (!refundModal) return;
    const amount = +refundAmount || 0;
    if (amount <= 0) return;
    const alreadyRefunded = getRefundedTotal(refundModal);
    const maxRefund = refundModal.total - alreadyRefunded;
    if (amount > maxRefund + 0.01) { alert(`Maximum refund is ${currency(maxRefund)}`); return; }

    // Restore selected serialized units to stock
    if (refundItems.length > 0) {
      const returnIds = new Set(refundItems);
      setProducts(prev => prev.map(p => {
        const hasUnits = p.units?.some(u => returnIds.has(u.id));
        if (hasUnits) return { ...p, units: p.units.map(u => returnIds.has(u.id) ? { ...u, status: "in_stock" } : u) };
        return p;
      }));
    }

    const refund = { id: uid(), amount, method: refundMethod, reason: refundReason.trim(), returnedUnits: refundItems, date: new Date().toISOString(), staff: activeStaff?.name || "", staffId: activeStaff?.id || "" };
    const newRefunds = [...(refundModal.refunds || []), refund];
    const totalRefundedNow = alreadyRefunded + amount;
    const fullyRefunded = totalRefundedNow >= refundModal.total - 0.01;

    setSales(prev => prev.map(s => s.id === refundModal.id ? { ...s, refunds: newRefunds, refunded: fullyRefunded, refundDate: fullyRefunded ? new Date().toISOString() : s.refundDate } : s));
    setSelected(prev => prev && prev.id === refundModal.id ? { ...prev, refunds: newRefunds, refunded: fullyRefunded, refundDate: fullyRefunded ? new Date().toISOString() : prev.refundDate } : prev);
    setRefundModal(null);
  };

  const totalActive = sales.filter(s => !s.refunded).reduce((t, s) => t + s.total - getRefundedTotal(s), 0);
  const totalRefundedAll = sales.reduce((t, s) => t + getRefundedTotal(s), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Total Sales" value={sales.length} color="#2563eb" />
        <StatCard label="Active Revenue" value={currency(totalActive)} color="#10b981" />
        <StatCard label="Refunded" value={currency(totalRefundedAll)} color="#ef4444" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input placeholder="Search by receipt #, IMEI, customer, product…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 0 }} />
        </div>
        <Select options={[{ value: "all", label: "All Time" }, { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "week", label: "This Week" }, { value: "month", label: "This Month" }, { value: "custom", label: "📅 Custom Range" }]} value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ width: 160, marginBottom: 0 }} />
        <Select options={[{ value: "all", label: "All Sales" }, { value: "active", label: "Active Only" }, { value: "refunded", label: "Refunded Only" }]} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 150, marginBottom: 0 }} />
      </div>

      {/* Custom date range picker for Sales History */}
      {dateFilter === "custom" && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 12, padding: "12px 14px", background: "#eef2ff", border: "1px solid #2563eb40", borderRadius: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>From Date</label>
            <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>To Date</label>
            <input type="date" value={customTo} min={customFrom} max={today()} onChange={e => setCustomTo(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
          </div>
          <div style={{ fontSize: 12, color: "#374151", padding: "10px 14px", background: "#ffffff", borderRadius: 10, border: "1px solid #d4d8e0", fontWeight: 600 }}>
            📊 {filtered.length} sales found
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #d4d8e0", color: "#6b7280", textAlign: "left" }}>
              <th style={{ padding: "10px 8px" }}>Receipt #</th>
              <th style={{ padding: "10px 8px" }}>Date</th>
              <th style={{ padding: "10px 8px" }}>Customer</th>
              <th style={{ padding: "10px 8px" }}>Sold By</th>
              <th style={{ padding: "10px 8px" }}>Items</th>
              <th style={{ padding: "10px 8px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "10px 8px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const cust = customers.find(c => c.id === s.customer);
              return (
                <tr key={s.id} onClick={() => setSelected(s)} style={{ borderBottom: "1px solid #e5e7eb", color: "#374151", cursor: "pointer", opacity: s.refunded ? 0.6 : 1 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#eef2ff"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 8px", fontFamily: "monospace", color: "#3b82f6", fontWeight: 700 }}>#{s.id.toUpperCase()}</td>
                  <td style={{ padding: "10px 8px" }}>{new Date(s.date).toLocaleString("en-GB")}</td>
                  <td style={{ padding: "10px 8px" }}>{cust ? cust.name : <span style={{ color: "#9ca3af" }}>Walk-in</span>}</td>
                  <td style={{ padding: "10px 8px", color: "#2563eb", fontWeight: 600 }}>{s.staff || <span style={{ color: "#9ca3af", fontWeight: 400 }}>—</span>}</td>
                  <td style={{ padding: "10px 8px", color: "#6b7280" }}>{s.items.reduce((t, i) => t + i.qty, 0)} item(s)</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: s.refunded ? "#ef4444" : "#10b981" }}>{currency(s.total)}</td>
                  <td style={{ padding: "10px 8px" }}>{s.refunded ? <Badge color="#ef4444">Refunded</Badge> : (s.refunds || []).length > 0 ? <Badge color="#f59e0b">Partial Refund</Badge> : <Badge color="#10b981">Completed</Badge>}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>No sales found</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Sale Detail Modal */}
      <Modal wide open={!!selected} onClose={() => setSelected(null)} title={selected ? `Receipt #${selected.id.toUpperCase()}` : ""}>
        {selected && (() => {
          const cust = customers.find(c => c.id === selected.customer);
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #d4d8e0" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Date & Time</div>
                  <div style={{ fontSize: 14, color: "#111827", fontWeight: 600 }}>{new Date(selected.date).toLocaleString("en-GB")}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Customer</div>
                  <div style={{ fontSize: 14, color: "#111827", fontWeight: 600 }}>{cust ? `${cust.name} · ${cust.phone || "—"}` : "Walk-in Customer"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Status</div>
                  <div>{selected.refunded ? <Badge color="#ef4444">Fully Refunded</Badge> : (selected.refunds || []).length > 0 ? <Badge color="#f59e0b">Partial Refund ({currency(getRefundedTotal(selected))})</Badge> : <Badge color="#10b981">Completed</Badge>}</div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Items Sold</div>
                {selected.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "#ffffff", border: "1px solid #d4d8e0", borderRadius: 10, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{item.qty}× {item.name}</div>
                      {(item.color || item.storage || item.grade) && <div style={{ fontSize: 12, color: "#2563eb", marginTop: 2 }}>{[item.color, item.storage, item.grade ? `Grade ${item.grade}` : ""].filter(Boolean).join(" · ")}</div>}
                      {item.imei && <div style={{ fontSize: 11, color: "#f59e0b", fontFamily: "monospace", marginTop: 2 }}>IMEI/SN: {item.imei}</div>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{currency(item.price * item.qty)}</div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: "1px solid #d4d8e0", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6b7280", marginBottom: 4 }}><span>Subtotal</span><span>{currency(selected.subtotal)}</span></div>
                {selected.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#ef4444", marginBottom: 4 }}><span>Discount</span><span>-{currency(selected.discountAmt)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, color: "#111827", marginTop: 6 }}><span>Total</span><span>{currency(selected.total)}</span></div>
                {selected.payment && <div style={{ marginTop: 6, fontSize: 12, color: "#374151" }}>💳 Paid: {selected.payment === "mix" ? `Cash ${currency(selected.cashPaid || 0)} + Card ${currency(selected.cardPaid || 0)}` : selected.payment === "card" ? "Card" : "Cash"}</div>}
              </div>

              {/* Refund History */}
              {(selected.refunds || []).length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #d4d8e0" }}>
                  <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Refund History</div>
                  {selected.refunds.map((rf, i) => (
                    <div key={rf.id || i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", padding: "4px 0", borderBottom: "1px solid #e5e7eb" }}>
                      <span>{new Date(rf.date).toLocaleString("en-GB")} · {rf.method === "card" ? "💳" : "💵"} {rf.method}{rf.reason ? ` — ${rf.reason}` : ""}</span>
                      <span style={{ color: "#ef4444", fontWeight: 700 }}>-{currency(rf.amount)}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#111827", marginTop: 6 }}>
                    <span>Remaining after refunds</span>
                    <span>{currency(selected.total - getRefundedTotal(selected))}</span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
                <Btn variant="ghost" onClick={() => setSelected(null)}>Close</Btn>
                <Btn variant="primary" onClick={() => printReceipt({ type: "sale", data: selected, customer: cust })}>🖨 Print / PDF</Btn>
                <Btn variant="success" onClick={() => sendWhatsApp({ type: "sale", data: selected, customer: cust }, cust?.phone)}>💬 WhatsApp</Btn>
                <Btn variant="warning" onClick={() => sendEmail({ type: "sale", data: selected, customer: cust }, cust?.email)}>✉ Email</Btn>
                {!selected.refunded && <Btn variant="danger" onClick={() => openRefund(selected)}>↩ Refund</Btn>}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Partial Refund Modal */}
      <Modal open={!!refundModal} onClose={() => setRefundModal(null)} title={refundModal ? `Refund — Receipt #${refundModal.id.toUpperCase()}` : ""}>
        {refundModal && (() => {
          const alreadyRefunded = getRefundedTotal(refundModal);
          const maxRefund = refundModal.total - alreadyRefunded;
          const serializedItems = refundModal.items.filter(i => i.unitId);
          const alreadyReturnedIds = new Set((refundModal.refunds || []).flatMap(r => r.returnedUnits || []));
          const returnableItems = serializedItems.filter(i => !alreadyReturnedIds.has(i.unitId));
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, padding: "10px 14px", background: "#f8f9fc", borderRadius: 10, border: "1px solid #d4d8e0" }}>
                <div><div style={{ fontSize: 11, color: "#6b7280" }}>Sale Total</div><div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{currency(refundModal.total)}</div></div>
                <div><div style={{ fontSize: 11, color: "#6b7280" }}>Already Refunded</div><div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{currency(alreadyRefunded)}</div></div>
                <div><div style={{ fontSize: 11, color: "#6b7280" }}>Max Refund</div><div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{currency(maxRefund)}</div></div>
              </div>
              <Input label="Refund Amount (£)" type="number" min={0} max={maxRefund} value={refundAmount} onChange={e => setRefundAmount(e.target.value)} />
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Refund To</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["cash", "💵 Cash"], ["card", "💳 Card"]].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setRefundMethod(val)}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${refundMethod === val ? "#2563eb" : "#d4d8e0"}`, background: refundMethod === val ? "#2563eb15" : "transparent", color: refundMethod === val ? "#2563eb" : "#6b7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</button>
                  ))}
                </div>
              </div>
              <Input label="Reason (optional)" placeholder="e.g. Customer changed mind, faulty device" value={refundReason} onChange={e => setRefundReason(e.target.value)} />
              {returnableItems.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Return items to stock?</label>
                  {returnableItems.map(item => (
                    <label key={item.unitId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: refundItems.includes(item.unitId) ? "#2563eb10" : "transparent", borderRadius: 8, marginBottom: 4, cursor: "pointer", fontSize: 13, color: "#374151" }}>
                      <input type="checkbox" checked={refundItems.includes(item.unitId)}
                        onChange={e => setRefundItems(prev => e.target.checked ? [...prev, item.unitId] : prev.filter(id => id !== item.unitId))} />
                      {item.name} {item.color || ""} {item.storage || ""} <span style={{ color: "#f59e0b", fontFamily: "monospace", fontSize: 11 }}>{item.imei}</span>
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="ghost" onClick={() => setRefundModal(null)}>Cancel</Btn>
                <Btn variant="danger" onClick={processRefund} disabled={!refundAmount || +refundAmount <= 0}>↩ Process Refund of {currency(+refundAmount || 0)}</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};


// ─── Customers ──────────────────────────────────────────────────────

const CustomersTab = ({ customers, setCustomers, sales }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const blank = { name: "", phone: "", email: "", notes: "" };
  const [form, setForm] = useState(blank);

  const openAdd = () => { setForm(blank); setEditing(null); setShowModal(true); };
  const openEdit = (c) => { setForm(c); setEditing(c.id); setShowModal(true); };
  const save = () => {
    if (!form.name) return;
    if (editing) setCustomers(prev => prev.map(c => c.id === editing ? { ...c, ...form } : c));
    else setCustomers(prev => [...prev, { ...form, id: uid(), joined: today() }]);
    setShowModal(false);
  };
  const del = (id) => setCustomers(prev => prev.filter(c => c.id !== id));
  const filtered = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));
  const getSpent = (cid) => sales.filter(s => s.customer === cid).reduce((t, s) => t + s.total, 0);
  const getVisits = (cid) => sales.filter(s => s.customer === cid).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}><Input placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 0 }} /></div>
        <Btn onClick={openAdd}>+ Add Customer</Btn>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, alignContent: "start" }}>
        {filtered.map(c => (
          <Card key={c.id} style={{ cursor: "pointer" }} onClick={() => openEdit(c)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>📱 {c.phone || "—"} · ✉️ {c.email || "—"}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); del(c.id); }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
              <div><div style={{ fontSize: 11, color: "#6b7280" }}>Spent</div><div style={{ fontSize: 15, fontWeight: 700, color: "#10b981" }}>{currency(getSpent(c.id))}</div></div>
              <div><div style={{ fontSize: 11, color: "#6b7280" }}>Visits</div><div style={{ fontSize: 15, fontWeight: 700, color: "#2563eb" }}>{getVisits(c.id)}</div></div>
              <div><div style={{ fontSize: 11, color: "#6b7280" }}>Since</div><div style={{ fontSize: 15, fontWeight: 700, color: "#6b7280" }}>{c.joined || "—"}</div></div>
            </div>
            {c.notes && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8, fontStyle: "italic" }}>📝 {c.notes}</div>}
          </Card>
        ))}
        {filtered.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#9ca3af", padding: 40 }}>No customers yet</div>}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Customer" : "Add Customer"}>
        <Input label="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input label="Phone Number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <Input label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        <Input label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
          <Btn onClick={save}>{editing ? "Save Changes" : "Add Customer"}</Btn>
        </div>
      </Modal>
    </div>
  );
};

// ─── Repairs ────────────────────────────────────────────────────────

const RepairsTab = ({ repairs, setRepairs, customers, setCustomers, activeStaff }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [repairSearch, setRepairSearch] = useState("");
  const blank = { customer: "", customerName: "", customerPhone: "", customerEmail: "", _autoFilled: false, device: "", imei: "", issue: "", status: "Received", cost: "", payment: "cash", cashPaid: "", notes: "" };
  const [form, setForm] = useState(blank);

  const openAdd = () => { setForm(blank); setEditing(null); setShowModal(true); };
  const openEdit = (r) => {
    const cust = customers.find(c => c.id === r.customer);
    setForm({ ...blank, ...r, cost: String(r.cost || ""), customerPhone: cust?.phone || "", customerName: cust?.name || "", customerEmail: cust?.email || "", _autoFilled: !!cust });
    setEditing(r.id);
    setShowModal(true);
  };
  const save = () => {
    if (!form.device || !form.issue) return;
    let customerId = form.customer;
    // If no existing customer matched, create a new one from entered details
    if (!customerId && form.customerName.trim()) {
      const newCust = {
        id: uid(),
        name: form.customerName.trim(),
        phone: form.customerPhone.trim(),
        email: form.customerEmail.trim(),
        notes: "",
        joined: today(),
      };
      setCustomers(prev => [...prev, newCust]);
      customerId = newCust.id;
    }
    const repairCost = +form.cost || 0;
    const item = { customer: customerId, device: form.device, imei: form.imei, issue: form.issue, status: form.status, cost: repairCost, payment: form.payment || "cash", cashPaid: form.payment === "mix" ? (+form.cashPaid || 0) : (form.payment === "cash" ? repairCost : 0), cardPaid: form.payment === "mix" ? (repairCost - (+form.cashPaid || 0)) : (form.payment === "card" ? repairCost : 0), notes: form.notes, staff: editing ? form.staff : (activeStaff?.name || ""), staffId: editing ? form.staffId : (activeStaff?.id || "") };
    if (editing) setRepairs(prev => prev.map(r => r.id === editing ? { ...r, ...item } : r));
    else setRepairs(prev => [...prev, { ...item, id: uid(), dateIn: today() }]);
    setShowModal(false);
  };
  const updateStatus = (id, status) => setRepairs(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  const filtered = repairs.filter(r => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (!repairSearch.trim()) return true;
    const q = repairSearch.toLowerCase();
    const cust = customers.find(c => c.id === r.customer);
    return r.id.toLowerCase().includes(q) ||
      (r.device || "").toLowerCase().includes(q) ||
      (r.imei || "").toLowerCase().includes(q) ||
      (r.issue || "").toLowerCase().includes(q) ||
      (cust && (cust.name.toLowerCase().includes(q) || (cust.phone || "").includes(repairSearch)));
  });
  const statusColors = { "Received": "#2563eb", "Diagnosing": "#a855f7", "Waiting for Parts": "#f59e0b", "In Repair": "#3b82f6", "Testing": "#06b6d4", "Ready for Pickup": "#10b981", "Completed": "#6b7280" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label="Active Repairs" value={repairs.filter(r => r.status !== "Completed").length} color="#f59e0b" />
        <StatCard label="Ready for Pickup" value={repairs.filter(r => r.status === "Ready for Pickup").length} color="#10b981" />
        <StatCard label="Completed" value={repairs.filter(r => r.status === "Completed").length} color="#6b7280" />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}><Input placeholder="Search by customer, device, IMEI, or fault…" value={repairSearch} onChange={e => setRepairSearch(e.target.value)} style={{ marginBottom: 0 }} /></div>
        <Select options={["All", ...REPAIR_STATUSES]} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 200, marginBottom: 0 }} />
        <Btn onClick={openAdd}>+ New Repair</Btn>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(r => {
          const cust = customers.find(c => c.id === r.customer);
          return (
            <Card key={r.id} style={{ cursor: "pointer" }} onClick={() => openEdit(r)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{r.device}</span>
                    <Badge color={statusColors[r.status] || "#2563eb"}>{r.status}</Badge>
                  </div>
                  {r.imei && <div style={{ fontSize: 12, color: "#f59e0b", fontFamily: "monospace", marginBottom: 3 }}>IMEI/SN: {r.imei}</div>}
                  <div style={{ fontSize: 13, color: "#6b7280" }}>Fault: {r.issue}</div>
                  {r.staff && <div style={{ fontSize: 11, color: "#2563eb", marginTop: 2 }}>👤 Booked by {r.staff}</div>}
                  {cust && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>Customer: {cust.name} · {cust.phone}</div>}
                  {r.notes && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>📝 {r.notes}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Date In</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{r.dateIn}</div>
                  {r.cost > 0 && <div style={{ fontSize: 15, fontWeight: 700, color: "#10b981", marginTop: 4 }}>{currency(r.cost)}</div>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {REPAIR_STATUSES.map(s => (
                  <button key={s} onClick={e => { e.stopPropagation(); updateStatus(r.id, s); }}
                    style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: `1px solid ${r.status === s ? statusColors[s] : "#d4d8e0"}`, background: r.status === s ? `${statusColors[s]}22` : "transparent", color: r.status === s ? statusColors[s] : "#505070", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    {s}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
                <button onClick={e => { e.stopPropagation(); openEdit(r); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #6b7280", background: "#6b728015", color: "#374151", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>✏️ Edit</button>
                <button onClick={e => { e.stopPropagation(); printReceipt({ type: "repair", data: r, customer: cust }); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb15", color: "#2563eb", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>🖨 Print Receipt</button>
                <button onClick={e => { e.stopPropagation(); sendWhatsApp({ type: "repair", data: r, customer: cust }, cust?.phone); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #10b981", background: "#05966915", color: "#10b981", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>💬 WhatsApp</button>
                <button onClick={e => { e.stopPropagation(); sendEmail({ type: "repair", data: r, customer: cust }, cust?.email); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #f59e0b", background: "#d9770615", color: "#f59e0b", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>✉ Email</button>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>No repairs found</div>}
      </div>
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Repair" : "New Repair"}>
        {/* Customer — phone number first, auto-fill if found */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Customer Phone Number *</label>
          <input placeholder="e.g. 07778 123456" value={form.customerPhone}
            onChange={e => {
              const phone = e.target.value;
              const found = customers.find(c => c.phone && c.phone.replace(/\s/g, "") === phone.replace(/\s/g, ""));
              if (found) {
                setForm(prev => ({ ...prev, customerPhone: phone, customer: found.id, customerName: found.name, customerEmail: found.email || "", _autoFilled: true }));
              } else {
                setForm(prev => ({ ...prev, customerPhone: phone, customer: "", customerName: prev._autoFilled ? "" : prev.customerName, customerEmail: prev._autoFilled ? "" : prev.customerEmail, _autoFilled: false }));
              }
            }}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${form._autoFilled ? "#10b981" : "#d4d8e0"}`, background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
          {form._autoFilled && <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>✅ Returning customer found — details auto-filled</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <Input label="Customer Name *" placeholder="Full name" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
          <Input label="Email (optional)" placeholder="name@example.com" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} />
        </div>
        <Input label="Device" placeholder="e.g. iPhone 15 Pro" value={form.device} onChange={e => setForm({ ...form, device: e.target.value })} />
        <Input label="IMEI / Serial Number (optional)" placeholder="e.g. 353456789012345" value={form.imei} onChange={e => setForm({ ...form, imei: e.target.value })} />
        <Input label="Fault" placeholder="e.g. Cracked screen, not charging" value={form.issue} onChange={e => setForm({ ...form, issue: e.target.value })} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
          <Select label="Status" options={REPAIR_STATUSES} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} />
          <Input label="Repair Cost (£)" type="number" min={0} value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Payment Method</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[["cash", "💵 Cash"], ["card", "💳 Card"], ["mix", "🔀 Split"]].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setForm({ ...form, payment: val, cashPaid: val !== "mix" ? "" : form.cashPaid })}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${form.payment === val ? "#2563eb" : "#d4d8e0"}`, background: form.payment === val ? "#2563eb15" : "transparent", color: form.payment === val ? "#2563eb" : "#6b7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</button>
            ))}
          </div>
          {form.payment === "mix" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <Input label="Cash (£)" type="number" min={0} value={form.cashPaid} onChange={e => setForm({ ...form, cashPaid: e.target.value })} style={{ marginBottom: 0 }} />
              <div><label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Card (£)</label><div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#f8f9fc", color: "#374151", fontSize: 14 }}>{currency(Math.max(0, (+form.cost || 0) - (+form.cashPaid || 0)))}</div></div>
            </div>
          )}
        </div>
        <Input label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
          <Btn onClick={save}>{editing ? "Save Changes" : "Create Repair"}</Btn>
        </div>
      </Modal>
    </div>
  );
};

// ─── Reports ────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// TRADE-INS TAB
// ═══════════════════════════════════════════════════════════════════

const TradeInsTab = ({ tradeIns, setTradeIns, customers, setCustomers, products, setProducts, activeStaff }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [stockModal, setStockModal] = useState(null); // trade-in being added to stock
  const [stockForm, setStockForm] = useState({ productId: "", newProductName: "", newProductSku: "", newProductCategory: "Smartphones", sellPrice: "" });

  const blank = {
    customer: "", customerName: "", customerPhone: "", customerEmail: "", customerAddress: "", _autoFilled: false,
    deviceModel: "", imei: "", color: "", storage: "", grade: "",
    notes: "", value: "", payment: "cash", dateIn: today(),
    idSeen: false, idType: "",
    addedToStock: false, linkedUnitId: "", linkedProductId: "",
  };
  const [form, setForm] = useState(blank);

  const openAdd = () => { setForm(blank); setEditing(null); setShowModal(true); };
  const openEdit = (t) => {
    const cust = customers.find(c => c.id === t.customer);
    setForm({ ...blank, ...t, value: String(t.value || ""), customerName: cust?.name || "", customerPhone: cust?.phone || "", customerEmail: cust?.email || "", customerAddress: cust?.address || t.customerAddress || "", _autoFilled: !!cust });
    setEditing(t.id);
    setShowModal(true);
  };

  const save = () => {
    if (!form.deviceModel || !form.value) { alert("Device Model and Trade-in Value are required"); return; }
    if (!form.idSeen) { alert("⚠️ You must confirm that customer ID has been seen before completing a trade-in."); return; }
    let customerId = form.customer;
    if (!customerId && form.customerName.trim()) {
      const newCust = { id: uid(), name: form.customerName.trim(), phone: form.customerPhone.trim(), email: form.customerEmail.trim(), address: form.customerAddress.trim(), notes: "", joined: today() };
      setCustomers(prev => [...prev, newCust]);
      customerId = newCust.id;
    } else if (customerId && form.customerAddress.trim()) {
      // Update existing customer's address if provided
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, address: form.customerAddress.trim() } : c));
    }
    const item = {
      customer: customerId,
      customerAddress: form.customerAddress.trim(),
      deviceModel: form.deviceModel,
      imei: form.imei, color: form.color, storage: form.storage, grade: form.grade,
      notes: form.notes, value: +form.value || 0, payment: form.payment,
      idSeen: form.idSeen, idType: form.idType,
      dateIn: form.dateIn || today(),
      status: editing ? form.status : "Received", // keep existing status if editing, default Received for new
      addedToStock: form.addedToStock || false,
      linkedUnitId: form.linkedUnitId || "", linkedProductId: form.linkedProductId || "",
      staff: editing ? (form.staff || "") : (activeStaff?.name || ""),
      staffId: editing ? (form.staffId || "") : (activeStaff?.id || ""),
    };
    if (editing) {
      setTradeIns(prev => prev.map(t => t.id === editing ? { ...t, ...item } : t));
    } else {
      setTradeIns(prev => [...prev, { id: uid(), ...item }]);
    }
    setShowModal(false);
  };

  const del = (id) => {
    if (!confirm("Delete this trade-in record?")) return;
    setTradeIns(prev => prev.filter(t => t.id !== id));
  };

  // Add trade-in unit to Inventory
  const openAddToStock = (t) => {
    // Try to match an existing product by model name
    const possibleMatch = products.find(p => p.serialized && p.name.toLowerCase().includes(t.deviceModel.toLowerCase()));
    setStockForm({
      productId: possibleMatch?.id || "",
      newProductName: possibleMatch ? "" : t.deviceModel,
      newProductSku: possibleMatch ? "" : t.deviceModel.replace(/\s/g, "").substring(0, 8).toUpperCase(),
      newProductCategory: "Smartphones",
      sellPrice: String(Math.round((t.value || 0) * 1.4)), // suggest 40% markup
    });
    setStockModal(t);
  };

  const confirmAddToStock = () => {
    if (!stockModal) return;
    const t = stockModal;
    const sellPrice = +stockForm.sellPrice || 0;
    if (!sellPrice) { alert("Enter a selling price"); return; }

    const cust = customers.find(c => c.id === t.customer);
    const supplier = cust ? `Trade-in: ${cust.name}` : "Trade-in customer";
    const unitId = uid();
    const newUnit = {
      id: unitId,
      imei: t.imei || `TI-${Date.now()}`,
      color: t.color || "",
      storage: t.storage || "",
      grade: t.grade || "",
      cost: t.value || 0,
      price: sellPrice,
      supplier,
      status: "in_stock",
    };

    let productId = stockForm.productId;
    if (productId) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, units: [...(p.units || []), newUnit] } : p));
    } else {
      if (!stockForm.newProductName.trim() || !stockForm.newProductSku.trim()) { alert("Enter product name and SKU"); return; }
      productId = uid();
      const newProduct = {
        id: productId,
        name: stockForm.newProductName.trim(),
        sku: stockForm.newProductSku.trim(),
        category: stockForm.newProductCategory,
        cost: t.value || 0, price: sellPrice,
        serialized: true, units: [newUnit], stock: 0,
      };
      setProducts(prev => [...prev, newProduct]);
    }

    setTradeIns(prev => prev.map(tr => tr.id === t.id ? { ...tr, status: "Added to Stock", addedToStock: true, linkedUnitId: unitId, linkedProductId: productId } : tr));
    setStockModal(null);
  };

  const filtered = tradeIns.filter(t => {
    if (statusFilter === "pending" && t.addedToStock) return false;
    if (statusFilter === "stocked" && !t.addedToStock) return false;
    if (search) {
      const s = search.toLowerCase();
      const cust = customers.find(c => c.id === t.customer);
      if (!(t.deviceModel || "").toLowerCase().includes(s)
        && !(t.imei || "").toLowerCase().includes(s)
        && !(cust?.name || "").toLowerCase().includes(s)
        && !(cust?.phone || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const totalSpend = tradeIns.reduce((sum, t) => sum + (t.value || 0), 0);
  const totalInStock = tradeIns.filter(t => t.addedToStock).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <StatCard label="Total Trade-ins" value={tradeIns.length} color="#2563eb" />
        <StatCard label="Total Spend" value={currency(totalSpend)} color="#f59e0b" sub="Paid to customers" />
        <StatCard label="Added to Stock" value={totalInStock} color="#10b981" />
        <StatCard label="Pending" value={tradeIns.filter(t => !t.addedToStock).length} color="#6b7280" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
        <div style={{ flex: 1 }}><Input placeholder="Search by device, IMEI, customer…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 0 }} /></div>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{ value: "All", label: "All Trade-Ins" }, { value: "pending", label: "Not Yet in Stock" }, { value: "stocked", label: "Added to Stock" }]} style={{ marginBottom: 0, width: 180 }} />
        <Btn variant="success" onClick={openAdd}>+ New Trade-In</Btn>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 6 }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>No trade-ins yet. Click "+ New Trade-In" to record one.</div>}
        {filtered.map(t => {
          const cust = customers.find(c => c.id === t.customer);
          return (
            <Card key={t.id} style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => openEdit(t)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{t.deviceModel}</div>
                    {t.addedToStock ? <Badge color="#10b981">In Inventory</Badge> : <Badge color="#f59e0b">Not Yet Stocked</Badge>}
                    {t.grade && <Badge color={t.grade === "A" ? "#10b981" : t.grade === "B" ? "#3b82f6" : t.grade === "C" ? "#f59e0b" : "#ef4444"}>Grade {t.grade}</Badge>}
                    {t.idSeen && <Badge color="#2563eb">✓ ID Seen</Badge>}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>{[t.color, t.storage].filter(Boolean).join(" · ")}{t.imei ? ` · IMEI: ${t.imei}` : ""}</div>
                  <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>👤 {cust?.name || "Unknown"}{cust?.phone ? ` · ${cust.phone}` : ""}</div>
                  {(cust?.address || t.customerAddress) && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>📍 {cust?.address || t.customerAddress}</div>}
                  {t.idSeen && t.idType && <div style={{ fontSize: 11, color: "#2563eb", marginTop: 2 }}>🪪 {t.idType} verified</div>}
                  {t.staff && <div style={{ fontSize: 11, color: "#2563eb", marginTop: 2 }}>👤 Accepted by {t.staff}</div>}
                  {t.notes && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>📝 {t.notes}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{currency(t.value || 0)}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{t.payment === "cash" ? "💵 Cash" : t.payment === "credit" ? "🎟 Store Credit" : "🏦 Bank Transfer"}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{new Date(t.dateIn).toLocaleDateString("en-GB")}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
                <button onClick={e => { e.stopPropagation(); openEdit(t); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #6b7280", background: "#6b728015", color: "#374151", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>✏️ Edit</button>
                {!t.addedToStock && <button onClick={e => { e.stopPropagation(); openAddToStock(t); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #10b981", background: "#10b98115", color: "#10b981", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>📦 Add to Stock</button>}
                {t.addedToStock && <span style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: "#10b98115", color: "#10b981", fontWeight: 600 }}>✅ In Inventory</span>}
                <button onClick={e => { e.stopPropagation(); del(t.id); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>🗑 Delete</button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* New/Edit Trade-In Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Trade-In" : "New Trade-In"}>
        {/* ─── SECTION 1: CUSTOMER INFO ─── */}
        <div style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>👤 Customer Information</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Phone Number *</label>
            <input placeholder="e.g. 07778 123456" value={form.customerPhone}
              onChange={e => {
                const phone = e.target.value;
                const found = customers.find(c => c.phone && c.phone.replace(/\s/g, "") === phone.replace(/\s/g, ""));
                if (found) setForm(prev => ({ ...prev, customerPhone: phone, customer: found.id, customerName: found.name, customerEmail: found.email || "", customerAddress: found.address || "", _autoFilled: true }));
                else setForm(prev => ({ ...prev, customerPhone: phone, customer: "", customerName: prev._autoFilled ? "" : prev.customerName, customerEmail: prev._autoFilled ? "" : prev.customerEmail, customerAddress: prev._autoFilled ? "" : prev.customerAddress, _autoFilled: false }));
              }}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${form._autoFilled ? "#10b981" : "#d4d8e0"}`, background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
            {form._autoFilled && <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>✅ Returning customer — details auto-filled</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Full Name *" placeholder="Customer's full name" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
            <Input label="Email (optional)" placeholder="name@example.com" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} />
          </div>
          <Input label="Address *" placeholder="e.g. 12 Example Street, Liverpool L1 4AB" value={form.customerAddress} onChange={e => setForm({ ...form, customerAddress: e.target.value })} />
        </div>

        {/* ─── SECTION 2: ID VERIFICATION ─── */}
        <div style={{ background: form.idSeen ? "#10b98110" : "#fef3c7", border: `1px solid ${form.idSeen ? "#10b981" : "#f59e0b"}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>🪪 ID Verification</div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", background: "#ffffff", border: `2px solid ${form.idSeen ? "#10b981" : "#d4d8e0"}`, borderRadius: 10, fontSize: 14, color: "#111827", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
            <input type="checkbox" checked={form.idSeen} onChange={e => setForm({ ...form, idSeen: e.target.checked, idType: e.target.checked ? form.idType : "" })}
              style={{ width: 20, height: 20, cursor: "pointer" }} />
            <span>{form.idSeen ? "✅ Customer ID has been verified" : "⚠️ Confirm ID has been seen"}</span>
          </label>
          {form.idSeen && (
            <div style={{ marginTop: 10 }}>
              <Select label="ID Type (optional)" value={form.idType} onChange={e => setForm({ ...form, idType: e.target.value })}
                options={[{ value: "", label: "Select type…" }, { value: "Driving Licence", label: "Driving Licence" }, { value: "Passport", label: "Passport" }, { value: "National ID", label: "National ID Card" }, { value: "Other", label: "Other" }]} />
            </div>
          )}
          {!form.idSeen && <div style={{ fontSize: 11, color: "#92400e", marginTop: 8 }}>ID verification is required before completing a trade-in.</div>}
        </div>

        {/* ─── SECTION 3: DEVICE DETAILS ─── */}
        <div style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>📱 Device Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 12px" }}>
            <Input label="Model *" placeholder="e.g. iPhone 13 Pro, Samsung Galaxy S22" value={form.deviceModel} onChange={e => setForm({ ...form, deviceModel: e.target.value })} />
            <Select label="Grade" options={[{ value: "", label: "Select grade…" }, ...GRADES.map(g => ({ value: g, label: `Grade ${g}` }))]} value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
            <Input label="IMEI / Serial" placeholder="353456789012345" value={form.imei} onChange={e => setForm({ ...form, imei: e.target.value })} />
            <Input label="Colour" placeholder="e.g. Black" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
            <Input label="Storage" placeholder="e.g. 128GB" value={form.storage} onChange={e => setForm({ ...form, storage: e.target.value })} />
          </div>
          <Input label="Condition Notes" placeholder="e.g. Small scratch on back, battery 89%, includes charger" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        {/* ─── SECTION 4: PAYMENT ─── */}
        <div style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>💰 Payment to Customer</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Trade-in Value (£) *" type="number" min={0} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
            <Input label="Date" type="date" value={form.dateIn} onChange={e => setForm({ ...form, dateIn: e.target.value })} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Payment Method</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[["cash", "💵 Cash"], ["credit", "🎟 Store Credit"], ["bank", "🏦 Bank Transfer"]].map(([val, label]) => (
                <button key={val} type="button" onClick={() => setForm({ ...form, payment: val })}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${form.payment === val ? "#f59e0b" : "#d4d8e0"}`, background: form.payment === val ? "#f59e0b15" : "#ffffff", color: form.payment === val ? "#f59e0b" : "#6b7280", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
          <Btn onClick={save}>{editing ? "Save Changes" : "Create Trade-In"}</Btn>
        </div>
      </Modal>

      {/* Add to Stock Modal */}
      <Modal open={!!stockModal} onClose={() => setStockModal(null)} title="Add Trade-In to Inventory">
        {stockModal && (
          <div>
            <div style={{ background: "#f8f9fc", border: "1px solid #d4d8e0", borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{stockModal.deviceModel}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{[stockModal.color, stockModal.storage, stockModal.grade ? `Grade ${stockModal.grade}` : ""].filter(Boolean).join(" · ")}</div>
              <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>Paid customer: {currency(stockModal.value || 0)} (this becomes the unit cost)</div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5 }}>Link to Existing Product</label>
              <Select value={stockForm.productId} onChange={e => setStockForm({ ...stockForm, productId: e.target.value })}
                options={[{ value: "", label: "— Create new product —" }, ...products.filter(p => p.serialized).map(p => ({ value: p.id, label: `${p.name} (${p.sku})` }))]} />
            </div>
            {!stockForm.productId && (
              <div style={{ background: "#eef2ff", border: "1px solid #2563eb40", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", marginBottom: 8 }}>🆕 New Product Details</div>
                <Input label="Product Name" value={stockForm.newProductName} onChange={e => setStockForm({ ...stockForm, newProductName: e.target.value })} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                  <Input label="SKU" value={stockForm.newProductSku} onChange={e => setStockForm({ ...stockForm, newProductSku: e.target.value })} />
                  <Select label="Category" options={CATEGORIES} value={stockForm.newProductCategory} onChange={e => setStockForm({ ...stockForm, newProductCategory: e.target.value })} />
                </div>
              </div>
            )}
            <Input label="Selling Price (£) *" type="number" min={0} value={stockForm.sellPrice} onChange={e => setStockForm({ ...stockForm, sellPrice: e.target.value })} />
            <div style={{ fontSize: 11, color: "#10b981", marginTop: -8, marginBottom: 12 }}>💰 Estimated profit: {currency(Math.max(0, (+stockForm.sellPrice || 0) - (stockModal.value || 0)))}</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setStockModal(null)}>Cancel</Btn>
              <Btn variant="success" onClick={confirmAddToStock}>📦 Add to Inventory</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// DEPOSITS TAB
// ═══════════════════════════════════════════════════════════════════

const DepositsTab = ({ deposits, setDeposits, customers, setCustomers, products, setProducts, sales, setSales, activeStaff }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statusFilter, setStatusFilter] = useState("Active");
  const [search, setSearch] = useState("");
  const [payModal, setPayModal] = useState(null); // deposit being paid toward
  const [payment, setPayment] = useState({ amount: "", method: "cash", cashAmount: "" });
  const [extendModal, setExtendModal] = useState(null);
  const [extendDays, setExtendDays] = useState("30");

  const blank = {
    customer: "", customerName: "", customerPhone: "", customerEmail: "", _autoFilled: false,
    items: [], // [{ id, productId, unitId, name, imei, color, storage, grade, price, isMain }]
    agreedPrice: "", depositAmount: "", depositMethod: "cash", depositCashAmount: "",
    dateTaken: today(), deadline: "", notes: "",
    status: "Active",
  };
  const [form, setForm] = useState(blank);
  const [scanInput, setScanInput] = useState("");
  const [scanMsg, setScanMsg] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState("");
  const [showReceipt, setShowReceipt] = useState(null); // deposit to show receipt for

  // Auto-compute default deadline (30 days from today)
  const computeDeadline = (fromDate, days = 30) => {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const openAdd = () => {
    setForm({ ...blank, deadline: computeDeadline(today(), 30) });
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (d) => {
    const cust = customers.find(c => c.id === d.customer);
    // Convert old single-product deposits to new items array format
    const items = d.items && d.items.length > 0 ? d.items : (d.productId ? [{
      id: uid(), productId: d.productId, unitId: d.unitId,
      name: d.productName, imei: d.imei, color: d.color, storage: d.storage, grade: d.grade,
      price: d.agreedPrice, isMain: true,
    }] : []);
    setForm({ ...blank, ...d, items,
      agreedPrice: String(d.agreedPrice || ""),
      depositAmount: String(d.depositAmount || ""),
      depositCashAmount: String(d.depositCashAmount || ""),
      customerName: cust?.name || "", customerPhone: cust?.phone || "", customerEmail: cust?.email || "",
      _autoFilled: !!cust,
    });
    setEditing(d.id);
    setShowModal(true);
  };

  // All reserved unit IDs that are locked by an active deposit (across all items)
  const reservedUnitIds = new Set(deposits.filter(d => d.status === "Active").flatMap(d => {
    if (d.items && d.items.length > 0) return d.items.filter(i => i.unitId).map(i => i.unitId);
    return d.unitId ? [d.unitId] : [];
  }));

  // Available serialized products for deposit (show only if they have unreserved in_stock units)
  const availableProducts = products.filter(p => {
    if (!p.serialized) return (p.stock || 0) > 0;
    return (p.units || []).some(u => u.status === "in_stock" && !reservedUnitIds.has(u.id));
  });

  const availableUnitsFor = (productId) => {
    const p = products.find(x => x.id === productId);
    if (!p || !p.serialized) return [];
    return (p.units || []).filter(u => u.status === "in_stock" && !reservedUnitIds.has(u.id));
  };

  // ─── Item Cart Helpers ───────────────────────────────────────
  const addItemToDeposit = (product, unit) => {
    const newItem = {
      id: uid(),
      productId: product.id,
      unitId: unit?.id || "",
      name: product.name,
      imei: unit?.imei || "",
      color: unit?.color || "",
      storage: unit?.storage || "",
      grade: unit?.grade || "",
      price: unit?.price ?? product.price ?? 0,
      isMain: false,
    };
    setForm(prev => {
      const newItems = [...prev.items, newItem];
      const newAgreed = newItems.reduce((t, i) => t + (i.price || 0), 0);
      return { ...prev, items: newItems, agreedPrice: String(newAgreed) };
    });
  };

  const removeItemFromDeposit = (itemId) => {
    setForm(prev => {
      const newItems = prev.items.filter(i => i.id !== itemId);
      const newAgreed = newItems.reduce((t, i) => t + (i.price || 0), 0);
      return { ...prev, items: newItems, agreedPrice: String(newAgreed) };
    });
  };

  const updateItemPrice = (itemId, newPrice) => {
    setForm(prev => {
      const newItems = prev.items.map(i => i.id === itemId ? { ...i, price: +newPrice || 0 } : i);
      const newAgreed = newItems.reduce((t, i) => t + (i.price || 0), 0);
      return { ...prev, items: newItems, agreedPrice: String(newAgreed) };
    });
  };

  // ─── Barcode Scanner ─────────────────────────────────────────
  const handleScan = (value) => {
    const scanned = value.trim();
    if (!scanned) return;
    setScanInput("");
    // Already in this deposit?
    if (form.items.some(i => i.imei === scanned)) {
      setScanMsg(`⚠️ ${scanned} — already added to this deposit`);
      setTimeout(() => setScanMsg(""), 3000);
      return;
    }
    // Find the unit
    for (const p of products) {
      if (!p.serialized) continue;
      const unit = (p.units || []).find(u => u.imei === scanned);
      if (unit) {
        if (unit.status === "sold") { setScanMsg(`❌ ${scanned} — already sold`); }
        else if (unit.status === "reserved") { setScanMsg(`⚠️ ${scanned} — already reserved on another deposit`); }
        else if (reservedUnitIds.has(unit.id)) { setScanMsg(`⚠️ ${scanned} — already reserved`); }
        else {
          addItemToDeposit(p, unit);
          setScanMsg(`✅ Added: ${p.name} — ${scanned}`);
        }
        setTimeout(() => setScanMsg(""), 3000);
        return;
      }
    }
    setScanMsg(`❌ IMEI not found: ${scanned}`);
    setTimeout(() => setScanMsg(""), 3000);
  };

  const save = () => {
    if (form.items.length === 0) { alert("Add at least one item to the deposit"); return; }
    if (!form.depositAmount) { alert("Deposit Amount is required"); return; }

    const agreed = +form.agreedPrice || 0;
    const deposit = +form.depositAmount || 0;
    if (deposit <= 0) { alert("Deposit amount must be greater than zero"); return; }
    if (deposit >= agreed) { alert("Deposit must be less than the total price. If paid in full, use POS instead."); return; }

    let customerId = form.customer;
    if (!customerId && form.customerName.trim()) {
      const newCust = { id: uid(), name: form.customerName.trim(), phone: form.customerPhone.trim(), email: form.customerEmail.trim(), notes: "", joined: today() };
      setCustomers(prev => [...prev, newCust]);
      customerId = newCust.id;
    }
    if (!customerId) { alert("Customer details are required"); return; }

    // Use the first serialized item as "main" device for display
    const mainItem = form.items.find(i => i.imei) || form.items[0];

    const item = {
      customer: customerId,
      items: form.items, // full items array
      // Legacy fields for back-compat with old display code
      productId: mainItem.productId, unitId: mainItem.unitId || "",
      productName: form.items.length === 1 ? mainItem.name : `${mainItem.name} + ${form.items.length - 1} more`,
      imei: mainItem.imei || "", color: mainItem.color || "", storage: mainItem.storage || "", grade: mainItem.grade || "",
      agreedPrice: agreed,
      depositAmount: deposit,
      depositMethod: form.depositMethod,
      depositCashAmount: form.depositMethod === "mix" ? (+form.depositCashAmount || 0) : (form.depositMethod === "cash" ? deposit : 0),
      depositCardAmount: form.depositMethod === "mix" ? (deposit - (+form.depositCashAmount || 0)) : (form.depositMethod === "card" ? deposit : 0),
      dateTaken: form.dateTaken || today(),
      deadline: form.deadline || computeDeadline(today(), 30),
      notes: form.notes,
      status: form.status || "Active",
      staff: editing ? (form.staff || "") : (activeStaff?.name || ""),
      staffId: editing ? (form.staffId || "") : (activeStaff?.id || ""),
    };

    if (editing) {
      setDeposits(prev => prev.map(d => d.id === editing ? { ...d, ...item } : d));
      setShowModal(false);
      return;
    }
    // First payment = the initial deposit
    const initialPayment = {
      id: uid(),
      amount: deposit,
      method: form.depositMethod,
      cashAmount: item.depositCashAmount,
      cardAmount: item.depositCardAmount,
      date: new Date().toISOString(),
      note: "Initial deposit",
      staff: activeStaff?.name || "",
      staffId: activeStaff?.id || "",
    };
    const newDep = { id: uid(), ...item, payments: [initialPayment] };
    setDeposits(prev => [...prev, newDep]);

    // Reserve all serialized units; decrement stock for non-serialized
    setProducts(prev => prev.map(p => {
      const productItems = form.items.filter(i => i.productId === p.id);
      if (productItems.length === 0) return p;
      if (p.serialized) {
        const reserveIds = new Set(productItems.filter(i => i.unitId).map(i => i.unitId));
        return { ...p, units: p.units.map(u => reserveIds.has(u.id) ? { ...u, status: "reserved" } : u) };
      } else {
        const qty = productItems.length;
        return { ...p, stock: Math.max(0, (p.stock || 0) - qty) };
      }
    }));

    setShowModal(false);
    // Auto-show the receipt after creating
    setShowReceipt(newDep);
  };

  // Cancel deposit — deposit is kept (non-refundable), unit returned to stock
  const cancelDeposit = (deposit) => {
    if (deposit.status !== "Active" && deposit.status !== "Expired") return;
    if (!confirm(`Cancel deposit for ${deposit.productName}?\n\nThe £${deposit.depositAmount.toFixed(2)} deposit will be KEPT (non-refundable) and the items will return to stock.`)) return;
    setDeposits(prev => prev.map(d => d.id === deposit.id ? { ...d, status: "Cancelled", cancelledDate: new Date().toISOString() } : d));
    // Return all items to stock
    const items = deposit.items && deposit.items.length > 0 ? deposit.items : (deposit.productId ? [{ productId: deposit.productId, unitId: deposit.unitId }] : []);
    setProducts(prev => prev.map(p => {
      const productItems = items.filter(i => i.productId === p.id);
      if (productItems.length === 0) return p;
      if (p.serialized) {
        const releaseIds = new Set(productItems.filter(i => i.unitId).map(i => i.unitId));
        return { ...p, units: p.units.map(u => releaseIds.has(u.id) ? { ...u, status: "in_stock" } : u) };
      } else {
        return { ...p, stock: (p.stock || 0) + productItems.length };
      }
    }));
  };

  // Calculate total paid across all payments
  const totalPaid = (deposit) => {
    if (deposit.payments && deposit.payments.length > 0) {
      return deposit.payments.reduce((t, p) => t + (p.amount || 0), 0);
    }
    // Fallback for old deposits without payments array
    return deposit.depositAmount || 0;
  };

  // Open payment modal (for both partial top-ups and final payment)
  const openPay = (deposit) => {
    const balance = deposit.agreedPrice - totalPaid(deposit);
    setPayment({ amount: String(balance.toFixed(2)), method: "cash", cashAmount: String(balance.toFixed(2)) });
    setPayModal(deposit);
  };

  // Process a payment — could be partial (adds to payments) or final (completes + creates sale)
  const processPayment = () => {
    if (!payModal) return;
    const deposit = payModal;
    const paidSoFar = totalPaid(deposit);
    const balance = deposit.agreedPrice - paidSoFar;
    const amount = +payment.amount || 0;
    if (amount <= 0) { alert("Enter a payment amount greater than zero"); return; }
    if (amount > balance + 0.01) { alert(`Maximum payment is ${currency(balance)} (the remaining balance)`); return; }

    const method = payment.method;
    const cash = method === "mix" ? (+payment.cashAmount || 0) : (method === "cash" ? amount : 0);
    const card = method === "mix" ? (amount - cash) : (method === "card" ? amount : 0);

    const newPayment = {
      id: uid(),
      amount, method,
      cashAmount: cash, cardAmount: card,
      date: new Date().toISOString(),
      note: "",
      staff: activeStaff?.name || "",
      staffId: activeStaff?.id || "",
    };

    const newTotal = paidSoFar + amount;
    const isComplete = newTotal >= deposit.agreedPrice - 0.01; // full payment (allow 1p rounding)

    // Get existing payments (handle old deposits without payments array)
    const existingPayments = deposit.payments && deposit.payments.length > 0
      ? deposit.payments
      : [{
          id: uid(),
          amount: deposit.depositAmount || 0,
          method: deposit.depositMethod || "cash",
          cashAmount: deposit.depositCashAmount || 0,
          cardAmount: deposit.depositCardAmount || 0,
          date: deposit.dateTaken ? new Date(deposit.dateTaken + "T12:00:00").toISOString() : new Date().toISOString(),
          note: "Initial deposit",
        }];

    const updatedPayments = [...existingPayments, newPayment];

    if (isComplete) {
      // Sum all cash and card across all payments for the sale record
      const totalCash = updatedPayments.reduce((t, p) => t + (p.cashAmount || 0), 0);
      const totalCard = updatedPayments.reduce((t, p) => t + (p.cardAmount || 0), 0);

      // Get all items (handle old single-product deposits)
      const items = deposit.items && deposit.items.length > 0 ? deposit.items : (deposit.productId ? [{
        productId: deposit.productId, unitId: deposit.unitId,
        name: deposit.productName, imei: deposit.imei, color: deposit.color, storage: deposit.storage, grade: deposit.grade,
        price: deposit.agreedPrice,
      }] : []);

      // Build sale items array
      const saleItems = items.map(it => {
        const product = products.find(p => p.id === it.productId);
        const unit = product?.serialized ? product.units.find(u => u.id === it.unitId) : null;
        return {
          productId: it.productId, name: it.name, qty: 1,
          price: it.price || 0,
          cost: unit?.cost ?? product?.cost ?? 0,
          imei: it.imei || "", unitId: it.unitId || "",
          color: it.color || "", storage: it.storage || "", grade: it.grade || "",
        };
      });

      const sale = {
        id: uid(),
        items: saleItems,
        subtotal: deposit.agreedPrice,
        discount: 0, discountAmt: 0,
        total: deposit.agreedPrice,
        payment: totalCash > 0 && totalCard > 0 ? "mix" : (totalCash > 0 ? "cash" : "card"),
        cashPaid: totalCash,
        cardPaid: totalCard,
        customer: deposit.customer,
        date: new Date().toISOString(),
        fromDeposit: deposit.id,
      };
      setSales(prev => [...prev, sale]);

      // Mark all serialized units sold + decrement non-serialized stock
      setProducts(prev => prev.map(p => {
        const productItems = items.filter(i => i.productId === p.id);
        if (productItems.length === 0) return p;
        if (p.serialized) {
          const soldIds = new Set(productItems.filter(i => i.unitId).map(i => i.unitId));
          return { ...p, units: p.units.map(u => soldIds.has(u.id) ? { ...u, status: "sold" } : u) };
        } else {
          // Non-serialized stock was already decremented when deposit was taken; nothing to do
          return p;
        }
      }));

      setDeposits(prev => prev.map(d => d.id === deposit.id
        ? { ...d, payments: updatedPayments, status: "Completed", completedDate: new Date().toISOString(), saleId: sale.id }
        : d));
    } else {
      // Partial payment — keep deposit active, just record the payment
      setDeposits(prev => prev.map(d => d.id === deposit.id
        ? { ...d, payments: updatedPayments, status: d.status === "Expired" ? "Active" : d.status }
        : d));
    }
    setPayModal(null);
  };

  // Extend deadline
  const confirmExtend = () => {
    if (!extendModal) return;
    const days = parseInt(extendDays, 10);
    if (!days || days <= 0) { alert("Enter a valid number of days"); return; }
    const currentDeadline = new Date(extendModal.deadline);
    currentDeadline.setDate(currentDeadline.getDate() + days);
    const newDeadline = currentDeadline.toISOString().slice(0, 10);
    setDeposits(prev => prev.map(d => d.id === extendModal.id
      ? { ...d, deadline: newDeadline, status: d.status === "Expired" ? "Active" : d.status, extensions: [...(d.extensions || []), { days, date: new Date().toISOString(), oldDeadline: d.deadline }] }
      : d));
    setExtendModal(null);
  };

  // Auto-mark expired deposits
  useEffect(() => {
    const todayDate = new Date(today());
    const toExpire = deposits.filter(d => d.status === "Active" && new Date(d.deadline) < todayDate);
    if (toExpire.length > 0) {
      setDeposits(prev => prev.map(d => toExpire.some(e => e.id === d.id) ? { ...d, status: "Expired" } : d));
    }
  }, []); // only on mount

  const daysUntilDeadline = (deadline) => {
    const diff = (new Date(deadline) - new Date(today())) / 86400000;
    return Math.ceil(diff);
  };

  const filtered = deposits.filter(d => {
    if (statusFilter !== "All" && d.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const cust = customers.find(c => c.id === d.customer);
      if (!(d.productName || "").toLowerCase().includes(s)
        && !(d.imei || "").toLowerCase().includes(s)
        && !(cust?.name || "").toLowerCase().includes(s)
        && !(cust?.phone || "").toLowerCase().includes(s)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (statusFilter === "Active") return new Date(a.deadline) - new Date(b.deadline);
    return new Date(b.dateTaken) - new Date(a.dateTaken);
  });

  const activeCount = deposits.filter(d => d.status === "Active").length;
  const expiredCount = deposits.filter(d => d.status === "Expired").length;
  const totalHeld = deposits.filter(d => d.status === "Active").reduce((t, d) => t + d.depositAmount, 0);
  const totalOutstanding = deposits.filter(d => d.status === "Active").reduce((t, d) => t + (d.agreedPrice - d.depositAmount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <StatCard label="Active Deposits" value={activeCount} color="#2563eb" sub={`${currency(totalHeld)} held`} />
        <StatCard label="Outstanding Balance" value={currency(totalOutstanding)} color="#f59e0b" sub="Customers owe us" />
        <StatCard label="Expired" value={expiredCount} color="#ef4444" sub="Needs attention" />
        <StatCard label="Completed" value={deposits.filter(d => d.status === "Completed").length} color="#10b981" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
        <div style={{ flex: 1 }}><Input placeholder="Search by product, IMEI, customer…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 0 }} /></div>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={["All", ...DEPOSIT_STATUSES]} style={{ marginBottom: 0, width: 160 }} />
        <Btn variant="success" onClick={openAdd}>+ New Deposit</Btn>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 6 }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>No deposits in this category.</div>}
        {filtered.map(d => {
          const cust = customers.find(c => c.id === d.customer);
          const paid = totalPaid(d);
          const balance = d.agreedPrice - paid;
          const paymentCount = (d.payments || []).length || 1;
          const days = daysUntilDeadline(d.deadline);
          const isExpired = d.status === "Expired";
          const isUrgent = d.status === "Active" && days <= 7;
          const statusColor = d.status === "Active" ? (isUrgent ? "#f59e0b" : "#2563eb") : d.status === "Completed" ? "#10b981" : d.status === "Expired" ? "#ef4444" : "#6b7280";
          return (
            <Card key={d.id} style={{ marginBottom: 10, cursor: "pointer", borderLeft: `4px solid ${statusColor}` }} onClick={() => openEdit(d)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{d.productName}</div>
                    <Badge color={statusColor}>{d.status}</Badge>
                    {d.grade && <Badge color={d.grade === "A" ? "#10b981" : d.grade === "B" ? "#3b82f6" : d.grade === "C" ? "#f59e0b" : "#ef4444"}>Grade {d.grade}</Badge>}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    {[d.color, d.storage].filter(Boolean).join(" · ")}{d.imei ? ` · IMEI: ${d.imei}` : ""}
                  </div>
                  <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>👤 {cust?.name || "Unknown"}{cust?.phone ? ` · ${cust.phone}` : ""}</div>
                  {d.status === "Active" && (
                    <div style={{ fontSize: 12, color: isUrgent ? "#f59e0b" : "#6b7280", marginTop: 4, fontWeight: 600 }}>
                      📅 Deadline: {new Date(d.deadline).toLocaleDateString("en-GB")}
                      {days > 0 ? ` · ${days} day${days === 1 ? "" : "s"} remaining` : days === 0 ? " · DUE TODAY" : ` · ${Math.abs(days)} days overdue`}
                    </div>
                  )}
                  {isExpired && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4, fontWeight: 700 }}>⚠ Expired on {new Date(d.deadline).toLocaleDateString("en-GB")}</div>}
                  {d.notes && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>📝 {d.notes}</div>}
                  {d.staff && <div style={{ fontSize: 11, color: "#2563eb", marginTop: 4 }}>👤 Taken by {d.staff}</div>}
                </div>
                <div style={{ textAlign: "right", minWidth: 160 }}>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Agreed Price</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{currency(d.agreedPrice)}</div>
                  <div style={{ fontSize: 11, color: "#10b981", marginTop: 6 }}>Paid: {currency(paid)}{paymentCount > 1 && ` (${paymentCount} payments)`}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: balance > 0 ? "#f59e0b" : "#10b981", marginTop: 2 }}>Balance: {currency(balance)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
                <button onClick={e => { e.stopPropagation(); openEdit(d); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #6b7280", background: "#6b728015", color: "#374151", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>✏️ Edit</button>
                <button onClick={e => { e.stopPropagation(); setShowReceipt(d); }}
                  style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #f59e0b", background: "#f59e0b15", color: "#f59e0b", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>📄 Receipt</button>
                {(d.status === "Active" || d.status === "Expired") && (
                  <button onClick={e => { e.stopPropagation(); openPay(d); }}
                    style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #10b981", background: "#10b98115", color: "#10b981", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>💰 Take Payment ({currency(balance)} left)</button>
                )}
                {(d.status === "Active" || d.status === "Expired") && (
                  <button onClick={e => { e.stopPropagation(); setExtendModal(d); setExtendDays("30"); }}
                    style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb15", color: "#2563eb", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>📅 Extend Deadline</button>
                )}
                {(d.status === "Active" || d.status === "Expired") && (
                  <button onClick={e => { e.stopPropagation(); cancelDeposit(d); }}
                    style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>🚫 Cancel (keep deposit)</button>
                )}
                {d.status === "Completed" && <span style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: "#10b98115", color: "#10b981", fontWeight: 600 }}>✅ Completed {d.completedDate ? new Date(d.completedDate).toLocaleDateString("en-GB") : ""}</span>}
                {d.status === "Cancelled" && <span style={{ fontSize: 11, padding: "5px 12px", borderRadius: 8, background: "#6b728015", color: "#6b7280", fontWeight: 600 }}>🚫 Cancelled (deposit kept)</span>}
              </div>
            </Card>
          );
        })}
      </div>

      {/* New/Edit Deposit Modal */}
      <Modal wide open={showModal} onClose={() => setShowModal(false)} title={editing ? "Edit Deposit" : "New Deposit"}>
        {/* ─── SECTION 1: CUSTOMER INFO ─── */}
        <div style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>👤 Customer Information</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Phone Number *</label>
            <input placeholder="e.g. 07778 123456" value={form.customerPhone}
              onChange={e => {
                const phone = e.target.value;
                const found = customers.find(c => c.phone && c.phone.replace(/\s/g, "") === phone.replace(/\s/g, ""));
                if (found) setForm(prev => ({ ...prev, customerPhone: phone, customer: found.id, customerName: found.name, customerEmail: found.email || "", _autoFilled: true }));
                else setForm(prev => ({ ...prev, customerPhone: phone, customer: "", customerName: prev._autoFilled ? "" : prev.customerName, customerEmail: prev._autoFilled ? "" : prev.customerEmail, _autoFilled: false }));
              }}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${form._autoFilled ? "#10b981" : "#d4d8e0"}`, background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
            {form._autoFilled && <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>✅ Returning customer — details auto-filled</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Full Name *" placeholder="Customer's full name" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
            <Input label="Email (optional)" placeholder="name@example.com" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} />
          </div>
        </div>

        {/* ─── SECTION 2: ADD ITEMS ─── */}
        <div style={{ background: "#eef2ff", border: "1px solid #2563eb40", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>📦 Items to Reserve</div>

          {/* Barcode scanner */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input placeholder="📷 Scan IMEI / Serial barcode here…" value={scanInput} onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleScan(scanInput); }}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #2563eb", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "monospace", boxSizing: "border-box", outline: "none" }} />
            </div>
            <Btn variant="ghost" onClick={() => { setShowProductPicker(true); setProductPickerSearch(""); }}>+ Add Other Item</Btn>
          </div>
          {scanMsg && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: scanMsg.startsWith("✅") ? "#10b98115" : scanMsg.startsWith("⚠") ? "#f59e0b15" : "#ef444415", color: scanMsg.startsWith("✅") ? "#10b981" : scanMsg.startsWith("⚠") ? "#f59e0b" : "#ef4444" }}>{scanMsg}</div>}

          {/* Items list */}
          {form.items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13, background: "#ffffff", borderRadius: 10, border: "1px dashed #d4d8e0" }}>
              📷 Scan a phone IMEI or click "+ Add Other Item" to add cases, screen protectors, etc.
            </div>
          ) : (
            <div style={{ background: "#ffffff", borderRadius: 10, border: "1px solid #d4d8e0" }}>
              {form.items.map((item, idx) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: idx < form.items.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{item.name}</div>
                    {item.imei && <div style={{ fontSize: 12, color: "#f59e0b", fontFamily: "monospace" }}>IMEI: {item.imei}</div>}
                    {(item.color || item.storage || item.grade) && <div style={{ fontSize: 11, color: "#6b7280" }}>{[item.color, item.storage, item.grade ? `Grade ${item.grade}` : ""].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <div style={{ width: 110 }}>
                    <input type="number" min={0} value={item.price} onChange={e => updateItemPrice(item.id, e.target.value)}
                      style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d4d8e0", background: "#ffffff", color: "#10b981", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textAlign: "right", boxSizing: "border-box", outline: "none" }} />
                  </div>
                  <button onClick={() => removeItemFromDeposit(item.id)} style={{ background: "transparent", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>✕</button>
                </div>
              ))}
              <div style={{ padding: "10px 12px", background: "#f8f9fc", borderTop: "2px solid #d4d8e0", display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800 }}>
                <span style={{ color: "#374151" }}>Total ({form.items.length} item{form.items.length === 1 ? "" : "s"})</span>
                <span style={{ color: "#111827" }}>{currency(+form.agreedPrice || 0)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── SECTION 3: PAYMENT ─── */}
        <div style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>💰 Deposit Payment</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Total Price</label>
              <div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{currency(+form.agreedPrice || 0)}</div>
            </div>
            <Input label="Deposit Amount (£) *" type="number" min={0} value={form.depositAmount} onChange={e => setForm({ ...form, depositAmount: e.target.value })} />
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>Balance Remaining</label>
              <div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#f59e0b", fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{currency(Math.max(0, (+form.agreedPrice || 0) - (+form.depositAmount || 0)))}</div>
            </div>
          </div>
          <div style={{ marginBottom: 0 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Payment Method</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[["cash", "💵 Cash"], ["card", "💳 Card"], ["mix", "🔀 Split"]].map(([val, label]) => (
                <button key={val} type="button" onClick={() => setForm({ ...form, depositMethod: val, depositCashAmount: val !== "mix" ? "" : form.depositCashAmount })}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${form.depositMethod === val ? "#2563eb" : "#d4d8e0"}`, background: form.depositMethod === val ? "#2563eb15" : "#ffffff", color: form.depositMethod === val ? "#2563eb" : "#6b7280", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</button>
              ))}
            </div>
            {form.depositMethod === "mix" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                <Input label="Cash (£)" type="number" min={0} value={form.depositCashAmount} onChange={e => setForm({ ...form, depositCashAmount: e.target.value })} style={{ marginBottom: 0 }} />
                <div><label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5 }}>Card (£)</label><div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#374151", fontSize: 14 }}>{currency(Math.max(0, (+form.depositAmount || 0) - (+form.depositCashAmount || 0)))}</div></div>
              </div>
            )}
          </div>
        </div>

        {/* ─── SECTION 4: DATES & NOTES ─── */}
        <div style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>📅 Dates & Notes</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Input label="Date Taken" type="date" value={form.dateTaken} onChange={e => setForm({ ...form, dateTaken: e.target.value, deadline: computeDeadline(e.target.value, 30) })} />
            <Input label="Deadline (default 30 days)" type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
          </div>
          <Input label="Notes (optional)" placeholder="e.g. Will collect weekend, negotiated price from £480" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
          <Btn onClick={save}>{editing ? "Save Changes" : "Reserve & Take Deposit"}</Btn>
        </div>
      </Modal>

      {/* Product Picker Modal — for adding accessories */}
      <Modal open={showProductPicker} onClose={() => setShowProductPicker(false)} title="Add Item to Deposit">
        <Input placeholder="Search by name, SKU…" value={productPickerSearch} onChange={e => setProductPickerSearch(e.target.value)} />
        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {availableProducts.filter(p => !productPickerSearch || p.name.toLowerCase().includes(productPickerSearch.toLowerCase()) || p.sku.toLowerCase().includes(productPickerSearch.toLowerCase())).map(p => {
            const inStock = p.serialized ? (p.units || []).filter(u => u.status === "in_stock" && !reservedUnitIds.has(u.id)).length : (p.stock || 0);
            return (
              <div key={p.id} style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{p.category} · {p.sku} · {currency(p.price)} · {inStock} in stock</div>
                </div>
                {p.serialized ? (
                  <button onClick={() => { setShowProductPicker(false); /* user will scan */ alert("This is a serialized product — scan its IMEI to add it."); }}
                    style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Scan IMEI</button>
                ) : (
                  <button onClick={() => { addItemToDeposit(p, null); setShowProductPicker(false); }}
                    style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>+ Add</button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Deposit Receipt Modal */}
      <Modal wide open={!!showReceipt} onClose={() => setShowReceipt(null)} title="Deposit Receipt">
        {showReceipt && (() => {
          const cust = customers.find(c => c.id === showReceipt.customer);
          const items = showReceipt.items && showReceipt.items.length > 0 ? showReceipt.items : (showReceipt.productId ? [{ name: showReceipt.productName, imei: showReceipt.imei, color: showReceipt.color, storage: showReceipt.storage, grade: showReceipt.grade, price: showReceipt.agreedPrice }] : []);
          const balance = showReceipt.agreedPrice - showReceipt.depositAmount;
          return (
            <div>
              <div style={{ background: "#f8f9fc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ textAlign: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #d4d8e0" }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#111827", letterSpacing: 1 }}>{SHOP.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{SHOP.address}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{SHOP.phone} · {SHOP.email}</div>
                  <div style={{ marginTop: 10, padding: "6px 12px", background: "#f59e0b", color: "#fff", borderRadius: 8, display: "inline-block", fontSize: 13, fontWeight: 700 }}>📅 DEPOSIT RECEIPT</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12, fontSize: 12 }}>
                  <div><strong>Receipt #:</strong> {showReceipt.id.toUpperCase().substring(0, 8)}</div>
                  <div style={{ textAlign: "right" }}><strong>Date:</strong> {new Date(showReceipt.dateTaken).toLocaleDateString("en-GB")}</div>
                  <div><strong>Customer:</strong> {cust?.name || "—"}</div>
                  <div style={{ textAlign: "right" }}><strong>Phone:</strong> {cust?.phone || "—"}</div>
                </div>
                <div style={{ marginBottom: 12, padding: 12, background: "#ffffff", border: "1px solid #d4d8e0", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Items Reserved</div>
                  {items.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: i < items.length - 1 ? "1px dashed #e5e7eb" : "none" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "#111827" }}>{it.name}</div>
                        {it.imei && <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>IMEI: {it.imei}</div>}
                        {(it.color || it.storage || it.grade) && <div style={{ fontSize: 11, color: "#6b7280" }}>{[it.color, it.storage, it.grade ? `Grade ${it.grade}` : ""].filter(Boolean).join(" · ")}</div>}
                      </div>
                      <div style={{ fontWeight: 700, color: "#111827" }}>{currency(it.price)}</div>
                    </div>
                  ))}
                </div>
                <table style={{ width: "100%", fontSize: 13, marginBottom: 12 }}>
                  <tbody>
                    <tr><td style={{ padding: "3px 0", color: "#6b7280" }}>Total Price:</td><td style={{ textAlign: "right", padding: "3px 0", color: "#111827", fontWeight: 700 }}>{currency(showReceipt.agreedPrice)}</td></tr>
                    <tr><td style={{ padding: "3px 0", color: "#10b981" }}>Deposit Paid Today:</td><td style={{ textAlign: "right", padding: "3px 0", color: "#10b981", fontWeight: 700 }}>{currency(showReceipt.depositAmount)}</td></tr>
                    <tr style={{ borderTop: "2px solid #d4d8e0" }}><td style={{ padding: "6px 0", fontSize: 16, color: "#f59e0b", fontWeight: 800 }}>BALANCE DUE:</td><td style={{ textAlign: "right", padding: "6px 0", fontSize: 16, color: "#f59e0b", fontWeight: 800 }}>{currency(balance)}</td></tr>
                  </tbody>
                </table>
                <div style={{ padding: 10, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, fontSize: 12, color: "#92400e", textAlign: "center", marginBottom: 8 }}>
                  ⚠️ <strong>Pay balance by {new Date(showReceipt.deadline).toLocaleDateString("en-GB")}</strong><br/>
                  Items reserved until this date · Deposit is non-refundable if not collected
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", textAlign: "center", marginTop: 10 }}>Thank you for your business — please bring this receipt when collecting your items.</div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
                <Btn variant="ghost" onClick={() => setShowReceipt(null)}>Close</Btn>
                <Btn variant="primary" onClick={() => printDepositReceipt(showReceipt, cust)}>🖨 Print / PDF</Btn>
                <Btn variant="success" onClick={() => shareDepositReceipt(showReceipt, cust, "whatsapp")}>💬 WhatsApp</Btn>
                <Btn variant="warning" onClick={() => shareDepositReceipt(showReceipt, cust, "email")}>✉ Email</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Take Payment Modal (supports partial top-ups AND final payment) */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Take Payment">
        {payModal && (() => {
          const paid = totalPaid(payModal);
          const balance = payModal.agreedPrice - paid;
          const amount = +payment.amount || 0;
          const isFinalPayment = amount >= balance - 0.01 && amount > 0;
          const payments = payModal.payments && payModal.payments.length > 0 ? payModal.payments : [{
            id: "legacy",
            amount: payModal.depositAmount || 0,
            method: payModal.depositMethod || "cash",
            date: payModal.dateTaken ? new Date(payModal.dateTaken + "T12:00:00").toISOString() : new Date().toISOString(),
            note: "Initial deposit",
          }];
          return (
            <div>
              <div style={{ background: "#f8f9fc", border: "1px solid #d4d8e0", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{payModal.productName}</div>
                {payModal.imei && <div style={{ fontSize: 12, color: "#f59e0b", fontFamily: "monospace", marginTop: 2 }}>IMEI: {payModal.imei}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
                  <div><div style={{ fontSize: 11, color: "#6b7280" }}>Agreed Price</div><div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{currency(payModal.agreedPrice)}</div></div>
                  <div><div style={{ fontSize: 11, color: "#6b7280" }}>Paid So Far</div><div style={{ fontSize: 16, fontWeight: 700, color: "#10b981" }}>{currency(paid)}</div></div>
                  <div><div style={{ fontSize: 11, color: "#6b7280" }}>Balance Due</div><div style={{ fontSize: 18, fontWeight: 800, color: "#f59e0b" }}>{currency(balance)}</div></div>
                </div>
              </div>

              {/* Payment history */}
              {payments.length > 0 && (
                <div style={{ marginBottom: 14, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Payment History</div>
                  {payments.map((p, i) => (
                    <div key={p.id || i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < payments.length - 1 ? "1px solid #f3f4f6" : "none", fontSize: 12 }}>
                      <div style={{ color: "#374151" }}>
                        {new Date(p.date).toLocaleDateString("en-GB")} · {p.method === "mix" ? "🔀 Split" : p.method === "card" ? "💳 Card" : "💵 Cash"}
                        {p.note && <span style={{ color: "#9ca3af", marginLeft: 6 }}>— {p.note}</span>}
                      </div>
                      <div style={{ color: "#10b981", fontWeight: 700 }}>{currency(p.amount)}</div>
                    </div>
                  ))}
                </div>
              )}

              <Input label="Payment Amount (£) *" type="number" min={0} max={balance} value={payment.amount}
                onChange={e => setPayment({ ...payment, amount: e.target.value, cashAmount: e.target.value })} />
              <div style={{ display: "flex", gap: 6, marginTop: -6, marginBottom: 12, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setPayment({ ...payment, amount: String(balance.toFixed(2)), cashAmount: String(balance.toFixed(2)) })}
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #2563eb", background: "#2563eb15", color: "#2563eb", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Full balance ({currency(balance)})</button>
                {balance >= 50 && <button type="button" onClick={() => setPayment({ ...payment, amount: "50", cashAmount: "50" })} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #d4d8e0", background: "transparent", color: "#6b7280", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>£50</button>}
                {balance >= 100 && <button type="button" onClick={() => setPayment({ ...payment, amount: "100", cashAmount: "100" })} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #d4d8e0", background: "transparent", color: "#6b7280", cursor: "pointer", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>£100</button>}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Payment Method</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["cash", "💵 Cash"], ["card", "💳 Card"], ["mix", "🔀 Split"]].map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setPayment({ ...payment, method: val, cashAmount: val !== "mix" ? payment.amount : payment.cashAmount })}
                      style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${payment.method === val ? "#10b981" : "#d4d8e0"}`, background: payment.method === val ? "#10b98115" : "transparent", color: payment.method === val ? "#10b981" : "#6b7280", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</button>
                  ))}
                </div>
                {payment.method === "mix" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <Input label="Cash (£)" type="number" min={0} max={amount} value={payment.cashAmount} onChange={e => setPayment({ ...payment, cashAmount: e.target.value })} style={{ marginBottom: 0 }} />
                    <div><label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5 }}>Card (£)</label><div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#f8f9fc", color: "#374151", fontSize: 14 }}>{currency(Math.max(0, amount - (+payment.cashAmount || 0)))}</div></div>
                  </div>
                )}
              </div>

              {isFinalPayment && <div style={{ background: "#10b98115", border: "1px solid #10b981", borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13, color: "#10b981", fontWeight: 600 }}>✅ This payment clears the balance — the sale will be completed and the phone marked sold.</div>}
              {!isFinalPayment && amount > 0 && <div style={{ background: "#2563eb15", border: "1px solid #2563eb", borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13, color: "#2563eb" }}>💰 Partial payment — remaining balance after this: <strong>{currency(balance - amount)}</strong></div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Btn variant="ghost" onClick={() => setPayModal(null)}>Cancel</Btn>
                <Btn variant="success" onClick={processPayment} disabled={!amount || amount <= 0}>{isFinalPayment ? `✅ Complete Sale (${currency(amount)})` : `💰 Record Payment (${currency(amount)})`}</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Extend Deadline Modal */}
      <Modal open={!!extendModal} onClose={() => setExtendModal(null)} title="Extend Deadline">
        {extendModal && (
          <div>
            <div style={{ background: "#f8f9fc", border: "1px solid #d4d8e0", borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{extendModal.productName}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Current deadline: <strong>{new Date(extendModal.deadline).toLocaleDateString("en-GB")}</strong></div>
            </div>
            <Input label="Extend by how many days?" type="number" min={1} value={extendDays} onChange={e => setExtendDays(e.target.value)} />
            <div style={{ fontSize: 12, color: "#10b981", marginTop: -8, marginBottom: 12 }}>📅 New deadline: {(() => { const d = new Date(extendModal.deadline); d.setDate(d.getDate() + (parseInt(extendDays, 10) || 0)); return d.toLocaleDateString("en-GB"); })()}</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setExtendModal(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={confirmExtend}>📅 Extend Deadline</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const ReportsTab = ({ sales, products, repairs, tradeIns = [], deposits = [] }) => {
  const [range, setRange] = useState("all");
  const [customFrom, setCustomFrom] = useState(today());
  const [customTo, setCustomTo] = useState(today());
  const now = new Date();
  const filterDate = (d) => {
    if (range === "all") return true;
    if (!d) return false;
    const date = new Date(d);
    // "Today" means the same calendar date
    if (range === "today") {
      return date.getFullYear() === now.getFullYear()
          && date.getMonth() === now.getMonth()
          && date.getDate() === now.getDate();
    }
    // "Yesterday"
    if (range === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return date.getFullYear() === y.getFullYear()
          && date.getMonth() === y.getMonth()
          && date.getDate() === y.getDate();
    }
    // "This week" means Monday–Sunday of the current week
    if (range === "week") {
      const startOfWeek = new Date(now);
      const dayOfWeek = startOfWeek.getDay(); // 0 = Sunday, 1 = Monday, ...
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startOfWeek.setDate(now.getDate() - daysFromMonday);
      startOfWeek.setHours(0, 0, 0, 0);
      return date >= startOfWeek && date <= now;
    }
    // "Last 7 days" — rolling window
    if (range === "last7") {
      const start = new Date(now); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
      return date >= start && date <= now;
    }
    // "This month" means the same calendar month of the current year
    if (range === "month") {
      return date.getFullYear() === now.getFullYear()
          && date.getMonth() === now.getMonth();
    }
    // "Last month" — previous calendar month
    if (range === "lastmonth") {
      const lm = new Date(now); lm.setDate(1); lm.setMonth(lm.getMonth() - 1);
      return date.getFullYear() === lm.getFullYear() && date.getMonth() === lm.getMonth();
    }
    // "Custom" — user-picked from/to dates (inclusive)
    if (range === "custom") {
      if (!customFrom || !customTo) return false;
      const start = new Date(customFrom + "T00:00:00");
      const end = new Date(customTo + "T23:59:59");
      return date >= start && date <= end;
    }
    return true;
  };

  // Sales filtered by period (include partial refunds; we subtract refunded amounts)
  const periodSales = sales.filter(s => filterDate(s.date));
  const filtered = periodSales.filter(s => !s.refunded); // for revenue/profit calcs

  // ─── Cash & Card Breakdown ──────────────────────────────────────
  // Sales (gross, before refunds)
  let salesCash = 0, salesCard = 0;
  periodSales.forEach(s => {
    salesCash += (s.cashPaid || (s.payment === "cash" ? s.total : 0));
    salesCard += (s.cardPaid || (s.payment === "card" ? s.total : 0));
  });
  // Sale refunds (only count refunds that occurred in the selected period)
  let salesCashRefunded = 0, salesCardRefunded = 0;
  sales.forEach(s => {
    (s.refunds || []).forEach(r => {
      if (filterDate(r.date)) {
        if (r.method === "card") salesCardRefunded += r.amount;
        else salesCashRefunded += r.amount;
      }
    });
  });

  // Repairs (only completed ones count as income)
  const periodRepairs = repairs.filter(r => r.status === "Completed" && filterDate(r.dateIn));
  let repairCash = 0, repairCard = 0;
  periodRepairs.forEach(r => {
    repairCash += (r.cashPaid || (r.payment === "cash" ? (r.cost || 0) : 0));
    repairCard += (r.cardPaid || (r.payment === "card" ? (r.cost || 0) : 0));
  });

  // Trade-in payouts (money going OUT to customers)
  const periodTradeIns = tradeIns.filter(t => filterDate(t.dateIn));
  let tradeInCashOut = 0, tradeInBankOut = 0, tradeInCreditOut = 0;
  periodTradeIns.forEach(t => {
    if (t.payment === "cash") tradeInCashOut += (t.value || 0);
    else if (t.payment === "bank") tradeInBankOut += (t.value || 0);
    else if (t.payment === "credit") tradeInCreditOut += (t.value || 0);
  });
  const totalTradeInSpend = tradeInCashOut + tradeInBankOut + tradeInCreditOut;

  // Deposits — all payments across all deposits (including top-ups), filtered by payment date
  let depositCashIn = 0, depositCardIn = 0;
  deposits.forEach(d => {
    const payments = d.payments && d.payments.length > 0 ? d.payments : [{
      amount: d.depositAmount || 0,
      cashAmount: d.depositCashAmount || 0,
      cardAmount: d.depositCardAmount || 0,
      date: d.dateTaken ? new Date(d.dateTaken + "T12:00:00").toISOString() : new Date().toISOString(),
    }];
    payments.forEach(p => {
      if (filterDate(p.date)) {
        depositCashIn += (p.cashAmount || 0);
        depositCardIn += (p.cardAmount || 0);
      }
    });
  });
  const totalDepositsIn = depositCashIn + depositCardIn;

  // NOTE: When a deposit is completed, the full sale is recorded.
  // To avoid double-counting, subtract all deposit payments that went into completed sales from sales totals.
  const depositsCompletedInPeriod = deposits.filter(d => d.status === "Completed" && d.completedDate && filterDate(d.completedDate));
  let depositDoubleCountCash = 0, depositDoubleCountCard = 0;
  depositsCompletedInPeriod.forEach(d => {
    const payments = d.payments && d.payments.length > 0 ? d.payments : [{ cashAmount: d.depositCashAmount || 0, cardAmount: d.depositCardAmount || 0 }];
    payments.forEach(p => {
      // Only subtract payments that fell within this period (already counted in depositCashIn)
      if (filterDate(p.date)) {
        depositDoubleCountCash += (p.cashAmount || 0);
        depositDoubleCountCard += (p.cardAmount || 0);
      }
    });
  });

  // Net (after refunds AND trade-in payouts AND fixing deposit double-counting)
  const netSalesCash = salesCash - salesCashRefunded - depositDoubleCountCash;
  const netSalesCard = salesCard - salesCardRefunded - depositDoubleCountCard;
  const totalCashIn = netSalesCash + repairCash + depositCashIn - tradeInCashOut;
  const totalCardIn = netSalesCard + repairCard + depositCardIn;
  const totalIntake = totalCashIn + totalCardIn;
  const totalRefunds = salesCashRefunded + salesCardRefunded;

  const revenue = filtered.reduce((t, s) => t + s.total, 0);
  const totalCost = filtered.reduce((t, s) => t + s.items.reduce((a, i) => a + ((i.cost || 0) * i.qty), 0), 0);
  const profit = revenue - totalCost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const itemsSold = filtered.reduce((t, s) => t + s.items.reduce((a, i) => a + i.qty, 0), 0);
  const avgSale = filtered.length ? revenue / filtered.length : 0;
  const prodMap = {};
  filtered.forEach(s => s.items.forEach(i => { prodMap[i.name] = (prodMap[i.name] || 0) + i.qty; }));
  const topProducts = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const dailyRev = {};
  for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); dailyRev[d.toISOString().slice(0, 10)] = 0; }
  sales.filter(s => !s.refunded).forEach(s => { const key = s.date.slice(0, 10); if (dailyRev[key] !== undefined) dailyRev[key] += s.total; });
  const maxDailyRev = Math.max(...Object.values(dailyRev), 1);
  const repairRev = repairs.filter(r => r.status === "Completed").reduce((t, r) => t + (r.cost || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["all", "All Time"], ["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 Days"], ["week", "This Week"], ["month", "This Month"], ["lastmonth", "Last Month"], ["custom", "📅 Custom Range"]].map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${range === v ? "#2563eb" : "#d4d8e0"}`, background: range === v ? "#2563eb15" : "transparent", color: range === v ? "#3b82f6" : "#7070a0", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{l}</button>
        ))}
      </div>

      {/* Custom date range picker — only shown when Custom is selected */}
      {range === "custom" && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, padding: "12px 14px", background: "#eef2ff", border: "1px solid #2563eb40", borderRadius: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>From Date</label>
            <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>To Date</label>
            <input type="date" value={customTo} min={customFrom} max={today()} onChange={e => setCustomTo(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 6, paddingBottom: 2 }}>
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); const v = d.toISOString().slice(0, 10); setCustomFrom(v); setCustomTo(v); }}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d4d8e0", background: "#ffffff", color: "#374151", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Yesterday</button>
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setCustomFrom(d.toISOString().slice(0, 10)); setCustomTo(today()); }}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d4d8e0", background: "#ffffff", color: "#374151", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Last 7 days</button>
            <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 30); setCustomFrom(d.toISOString().slice(0, 10)); setCustomTo(today()); }}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d4d8e0", background: "#ffffff", color: "#374151", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Last 30 days</button>
          </div>
        </div>
      )}

      {/* Range summary banner */}
      <div style={{ marginBottom: 16, padding: "8px 14px", background: "#f8f9fc", borderRadius: 10, fontSize: 12, color: "#6b7280" }}>
        📊 Showing data for: <strong style={{ color: "#111827" }}>
          {range === "all" && "All Time"}
          {range === "today" && `Today (${new Date().toLocaleDateString("en-GB")})`}
          {range === "yesterday" && (() => { const d = new Date(); d.setDate(d.getDate() - 1); return `Yesterday (${d.toLocaleDateString("en-GB")})`; })()}
          {range === "last7" && "Last 7 days (rolling)"}
          {range === "week" && "This week (Monday to today)"}
          {range === "month" && `This month (${now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })})`}
          {range === "lastmonth" && (() => { const lm = new Date(); lm.setDate(1); lm.setMonth(lm.getMonth() - 1); return `Last month (${lm.toLocaleDateString("en-GB", { month: "long", year: "numeric" })})`; })()}
          {range === "custom" && `${new Date(customFrom).toLocaleDateString("en-GB")} to ${new Date(customTo).toLocaleDateString("en-GB")}`}
        </strong>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <StatCard label="Total Revenue" value={currency(revenue)} color="#10b981" sub={`${filtered.length} transactions`} />
        <StatCard label="Total Cost" value={currency(totalCost)} color="#ef4444" sub="What you paid" />
        <StatCard label="Net Profit" value={currency(profit)} color="#2563eb" sub={`${profitMargin.toFixed(1)}% margin`} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Items Sold" value={itemsSold} color="#2563eb" />
        <StatCard label="Average Sale" value={currency(avgSale)} color="#3b82f6" />
        <StatCard label="Repair Revenue" value={currency(repairRev)} color="#f59e0b" />
      </div>

      {/* Cash & Card Breakdown */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>💰 Cash & Card Breakdown</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>Net amounts (after refunds)</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ background: "#10b98110", border: "1px solid #10b98140", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>💵 Cash In</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#10b981" }}>{currency(totalCashIn)}</div>
          </div>
          <div style={{ background: "#2563eb10", border: "1px solid #2563eb40", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>💳 Card In</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#2563eb" }}>{currency(totalCardIn)}</div>
          </div>
          <div style={{ background: "linear-gradient(135deg, #2563eb15, #3b82f615)", border: "2px solid #2563eb", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 4, fontWeight: 600 }}>💼 Total Intake</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#111827" }}>{currency(totalIntake)}</div>
          </div>
        </div>

        {/* Detailed split */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #d4d8e0", color: "#6b7280", textAlign: "left" }}>
              <th style={{ padding: "8px 4px" }}>Source</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Cash</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Card</th>
              <th style={{ padding: "8px 4px", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td style={{ padding: "8px 4px", color: "#374151", fontWeight: 600 }}>Sales (gross)</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "#10b981" }}>{currency(salesCash)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "#2563eb" }}>{currency(salesCard)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: "#111827" }}>{currency(salesCash + salesCard)}</td>
            </tr>
            {totalRefunds > 0 && (
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px 4px", color: "#ef4444", fontWeight: 600 }}>Refunds</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: "#ef4444" }}>-{currency(salesCashRefunded)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: "#ef4444" }}>-{currency(salesCardRefunded)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: "#ef4444" }}>-{currency(totalRefunds)}</td>
              </tr>
            )}
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td style={{ padding: "8px 4px", color: "#374151", fontWeight: 600 }}>Repairs (completed)</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "#10b981" }}>{currency(repairCash)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", color: "#2563eb" }}>{currency(repairCard)}</td>
              <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: "#111827" }}>{currency(repairCash + repairCard)}</td>
            </tr>
            {totalDepositsIn > 0 && (
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px 4px", color: "#374151", fontWeight: 600 }}>Deposit Payments</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: "#10b981" }}>{currency(depositCashIn)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: "#2563eb" }}>{currency(depositCardIn)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: "#111827" }}>{currency(totalDepositsIn)}</td>
              </tr>
            )}
            {totalTradeInSpend > 0 && (
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px 4px", color: "#f59e0b", fontWeight: 600 }}>Trade-In Payouts {tradeInBankOut > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}>(+ {currency(tradeInBankOut)} bank)</span>}{tradeInCreditOut > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "#6b7280" }}> (+ {currency(tradeInCreditOut)} store credit)</span>}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: "#f59e0b" }}>-{currency(tradeInCashOut)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: "#9ca3af" }}>—</td>
                <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700, color: "#f59e0b" }}>-{currency(tradeInCashOut)}</td>
              </tr>
            )}
            <tr style={{ borderTop: "2px solid #111827" }}>
              <td style={{ padding: "10px 4px", fontWeight: 800, color: "#111827", fontSize: 14 }}>NET TOTAL</td>
              <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 800, color: "#10b981", fontSize: 14 }}>{currency(totalCashIn)}</td>
              <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 800, color: "#2563eb", fontSize: 14 }}>{currency(totalCardIn)}</td>
              <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 900, color: "#111827", fontSize: 16 }}>{currency(totalIntake)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Revenue (Last 7 Days)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
            {Object.entries(dailyRev).map(([day, val]) => (
              <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700 }}>{val > 0 ? `£${Math.round(val)}` : ""}</div>
                <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "linear-gradient(180deg, #2563eb, #3b82f6)", height: `${Math.max((val / maxDailyRev) * 120, 4)}px`, transition: "height 0.3s" }} />
                <div style={{ fontSize: 10, color: "#9ca3af" }}>{day.slice(5)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Top Selling Products</div>
          {topProducts.length === 0 && <div style={{ color: "#9ca3af", fontSize: 13 }}>No sales data yet</div>}
          {topProducts.map(([name, qty], i) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: `${["#2563eb", "#3b82f6", "#a855f7", "#c084fc", "#d8b4fe"][i]}33`, color: ["#2563eb", "#3b82f6", "#a855f7", "#c084fc", "#d8b4fe"][i], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{name}</span>
              <Badge color="#3b82f6">{qty} sold</Badge>
            </div>
          ))}
        </Card>
        <Card style={{ gridColumn: "1/-1" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 14 }}>Recent Sales</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #d4d8e0", color: "#6b7280", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>Date</th><th style={{ padding: "8px" }}>Items</th><th style={{ padding: "8px" }}>Variant / IMEI</th><th style={{ padding: "8px", textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(-10).reverse().map(s => (
                <tr key={s.id} style={{ borderBottom: "1px solid #e5e7eb", color: "#374151" }}>
                  <td style={{ padding: "8px" }}>{new Date(s.date).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>{s.items.map(i => `${i.qty}x ${i.name}`).join(", ")}</td>
                  <td style={{ padding: "8px", fontSize: 11 }}>
                    {s.items.filter(i => i.imei).map((i, idx) => (
                      <div key={idx} style={{ marginBottom: 2 }}>
                        {(i.color || i.storage) && <span style={{ color: "#2563eb" }}>{[i.color, i.storage, i.grade ? `Grade ${i.grade}` : ""].filter(Boolean).join(" · ")} </span>}
                        <span style={{ fontFamily: "monospace", color: "#f59e0b" }}>{i.imei}</span>
                      </div>
                    ))}
                    {!s.items.some(i => i.imei) && <span style={{ color: "#9ca3af" }}>—</span>}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: "#10b981" }}>{currency(s.total)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>No sales recorded yet</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};

// ─── Main App ───────────────────────────────────────────────────────

// ─── Login Screen ───────────────────────────────────────────────────

const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const msg = err.code === "auth/invalid-credential" ? "Wrong email or password" :
                  err.code === "auth/too-many-requests" ? "Too many attempts. Try again later." :
                  err.message.replace("Firebase: ", "");
      setError(msg);
    }
    setLoading(false);
  };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f5f7fa 0%, #ffffff 100%)", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ background: "linear-gradient(145deg, #ffffff, #f8f9fc)", border: "1px solid #d4d8e0", borderRadius: 20, padding: 40, width: 380, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>📱</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827" }}>SP Phones</h1>
          <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, marginTop: 4, letterSpacing: 2 }}>POS SYSTEM</div>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #d4d8e0", background: "#ffffff", color: "#111827", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
          </div>
          {error && <div style={{ background: "#dc262615", border: "1px solid #ef4444", color: "#ef4444", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 14 }}>⚠ {error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: loading ? "#444" : "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: "#9ca3af" }}>Authorised personnel only</div>
      </div>
    </div>
  );
};

export default function PhoneShopPOS() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthChecking(false); });
    return unsub;
  }, []);

  if (authChecking) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f7fa", color: "#3b82f6", fontFamily: "'DM Sans', sans-serif", fontSize: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      Loading…
    </div>
  );
  if (!user) return <LoginScreen />;
  return <MainApp user={user} />;
}

// ═══════════════════════════════════════════════════════════════════
// STAFF PICKER — shown after Firebase login, before reaching the app
// ═══════════════════════════════════════════════════════════════════

const StaffPicker = ({ staff, setStaff, onSelect }) => {
  const [pinModal, setPinModal] = useState(null); // staff member entering PIN
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("staff");

  const handleStaffClick = (member) => {
    if (!member.pin) { onSelect({ id: member.id, name: member.name, role: member.role }); return; }
    setPinModal(member);
    setPin("");
    setPinError("");
  };

  const submitPin = () => {
    if (pin === pinModal.pin) {
      onSelect({ id: pinModal.id, name: pinModal.name, role: pinModal.role });
    } else {
      setPinError("Wrong PIN — try again");
      setPin("");
    }
  };

  const addStaff = () => {
    if (!newStaffName.trim()) { alert("Enter a name"); return; }
    if (newStaffPin && !/^\d{4}$/.test(newStaffPin)) { alert("PIN must be exactly 4 digits"); return; }
    setStaff(prev => [...prev, { id: uid(), name: newStaffName.trim(), pin: newStaffPin, role: newStaffRole, joined: today() }]);
    setNewStaffName(""); setNewStaffPin(""); setNewStaffRole("staff");
    setShowAddStaff(false);
  };

  const removeStaff = (id) => {
    if (!confirm("Remove this staff member? They will not be able to sign in anymore.")) return;
    setStaff(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f0f4ff 0%, #fff 100%)", fontFamily: "'DM Sans', sans-serif", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 36, width: "100%", maxWidth: 720, boxShadow: "0 24px 64px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>📱</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827" }}>{SHOP.name}</h1>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>Who's working?</div>
        </div>

        {staff.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 14, marginBottom: 16 }}>No staff members yet. Add the first one to get started.</div>
            <Btn variant="primary" onClick={() => setShowAddStaff(true)}>+ Add Staff Member</Btn>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
              {staff.map(member => (
                <div key={member.id} style={{ position: "relative" }}>
                  <button onClick={() => handleStaffClick(member)}
                    style={{ width: "100%", padding: "20px 12px", borderRadius: 14, border: "2px solid #e5e7eb", background: "#f8f9fc", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.background = "#eef2ff"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f8f9fc"; }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, margin: "0 auto 8px" }}>
                      {member.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{member.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{member.role === "owner" ? "👑 Owner" : "👤 Staff"}</div>
                    {member.pin && <div style={{ fontSize: 10, color: "#2563eb", marginTop: 4 }}>🔒 PIN required</div>}
                  </button>
                  <button onClick={() => removeStaff(member.id)}
                    style={{ position: "absolute", top: 4, right: 4, background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 14, padding: 4, borderRadius: 4 }}
                    title="Remove staff member">✕</button>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center" }}>
              <Btn variant="ghost" onClick={() => setShowAddStaff(true)}>+ Add Staff Member</Btn>
            </div>
          </>
        )}
      </div>

      {/* PIN Entry Modal */}
      <Modal open={!!pinModal} onClose={() => { setPinModal(null); setPin(""); setPinError(""); }} title={pinModal ? `Enter PIN for ${pinModal.name}` : ""}>
        {pinModal && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, margin: "0 auto 10px" }}>
                {pinModal.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{pinModal.name}</div>
            </div>
            <input type="password" inputMode="numeric" maxLength={4} placeholder="• • • •" value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
              onKeyDown={e => { if (e.key === "Enter" && pin.length === 4) submitPin(); }}
              style={{ width: "100%", padding: "16px 14px", borderRadius: 10, border: `2px solid ${pinError ? "#ef4444" : "#d4d8e0"}`, background: "#ffffff", color: "#111827", fontSize: 28, textAlign: "center", letterSpacing: 8, fontFamily: "monospace", boxSizing: "border-box", outline: "none" }} />
            {pinError && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 8, textAlign: "center" }}>⚠ {pinError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <Btn variant="ghost" onClick={() => { setPinModal(null); setPin(""); setPinError(""); }}>Cancel</Btn>
              <Btn variant="primary" onClick={submitPin} disabled={pin.length !== 4}>Sign In</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Staff Modal */}
      <Modal open={showAddStaff} onClose={() => { setShowAddStaff(false); setNewStaffName(""); setNewStaffPin(""); setNewStaffRole("staff"); }} title="Add Staff Member">
        <Input label="Full Name *" placeholder="e.g. John Smith" value={newStaffName} onChange={e => setNewStaffName(e.target.value)} />
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Role</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[["staff", "👤 Staff"], ["owner", "👑 Owner"]].map(([val, label]) => (
              <button key={val} type="button" onClick={() => setNewStaffRole(val)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${newStaffRole === val ? "#2563eb" : "#d4d8e0"}`, background: newStaffRole === val ? "#2563eb15" : "#ffffff", color: newStaffRole === val ? "#2563eb" : "#6b7280", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</button>
            ))}
          </div>
        </div>
        <Input label="4-Digit PIN (optional)" type="text" inputMode="numeric" maxLength={4} placeholder="e.g. 1234" value={newStaffPin} onChange={e => setNewStaffPin(e.target.value.replace(/\D/g, ""))} />
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: -8, marginBottom: 12 }}>💡 Adds a quick check before they can sign in. Leave blank for no PIN.</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => { setShowAddStaff(false); setNewStaffName(""); setNewStaffPin(""); setNewStaffRole("staff"); }}>Cancel</Btn>
          <Btn variant="success" onClick={addStaff}>Add Staff Member</Btn>
        </div>
      </Modal>
    </div>
  );
};

function MainApp({ user }) {
  const [tab, setTab] = useState("pos");
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [tradeIns, setTradeIns] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [deletionLogs, setDeletionLogs] = useState([]);
  const [staff, setStaff] = useState([]);
  const [activeStaff, setActiveStaff] = useState(null); // { id, name } currently signed in
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, s, c, r, t, d, dl, st] = await Promise.all([
        loadData("pos-products-v3", SAMPLE_PRODUCTS),
        loadData("pos-sales-v3", []),
        loadData("pos-customers-v3", []),
        loadData("pos-repairs-v3", []),
        loadData("pos-tradeins-v3", []),
        loadData("pos-deposits-v1", []),
        loadData("pos-deletion-logs-v1", []),
        loadData("pos-staff-v1", []),
      ]);
      setProducts(p); setSales(s); setCustomers(c); setRepairs(r); setTradeIns(t); setDeposits(d); setDeletionLogs(dl); setStaff(st);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveData("pos-products-v3", products); }, [products, loaded]);
  useEffect(() => { if (loaded) saveData("pos-sales-v3", sales); }, [sales, loaded]);
  useEffect(() => { if (loaded) saveData("pos-customers-v3", customers); }, [customers, loaded]);
  useEffect(() => { if (loaded) saveData("pos-repairs-v3", repairs); }, [repairs, loaded]);
  useEffect(() => { if (loaded) saveData("pos-tradeins-v3", tradeIns); }, [tradeIns, loaded]);
  useEffect(() => { if (loaded) saveData("pos-deposits-v1", deposits); }, [deposits, loaded]);
  useEffect(() => { if (loaded) saveData("pos-deletion-logs-v1", deletionLogs); }, [deletionLogs, loaded]);
  useEffect(() => { if (loaded) saveData("pos-staff-v1", staff); }, [staff, loaded]);

  const resetAll = async () => {
    if (!confirm("Reset ALL data? This cannot be undone.")) return;
    setProducts(SAMPLE_PRODUCTS); setSales([]); setCustomers([]); setRepairs([]); setTradeIns([]); setDeposits([]); setDeletionLogs([]); setStaff([]);
    setActiveStaff(null);
  };

  if (!loaded) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f7fa", color: "#3b82f6", fontFamily: "'DM Sans', sans-serif", fontSize: 18 }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>Loading Phone Shop POS…</div>
    </div>
  );

  // No staff selected → show staff picker
  if (!activeStaff) return <StaffPicker staff={staff} setStaff={setStaff} onSelect={setActiveStaff} />;

  return (
    <div style={{ height: "100vh", display: "flex", fontFamily: "'DM Sans', sans-serif", background: "#f5f7fa", color: "#374151", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ width: sidebarOpen ? 220 : 64, flexShrink: 0, background: "linear-gradient(180deg, #f0f2f5, #e8ecf0)", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", transition: "width 0.3s", overflow: "hidden" }}>
        <div style={{ padding: sidebarOpen ? "20px 18px" : "20px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setSidebarOpen(!sidebarOpen)}>
          <span style={{ fontSize: 28 }}>📱</span>
          {sidebarOpen && <div><div style={{ fontSize: 16, fontWeight: 800, color: "#111827", whiteSpace: "nowrap" }}>Phone Shop</div><div style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>POS SYSTEM</div></div>}
        </div>
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 14px", marginBottom: 4, borderRadius: 12, border: "none", background: tab === t ? "linear-gradient(135deg, rgba(37,99,235,0.1), rgba(59,130,246,0.06))" : "transparent", color: tab === t ? "#2563eb" : "#6060a0", cursor: "pointer", fontSize: 14, fontWeight: tab === t ? 700 : 500, fontFamily: "'DM Sans', sans-serif", textAlign: "left", transition: "all 0.2s", borderLeft: tab === t ? "3px solid #3b82f6" : "3px solid transparent" }}>
              <svg width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={TAB_ICONS[t]} /></svg>
              {sidebarOpen && <span style={{ whiteSpace: "nowrap" }}>{TAB_LABELS[t]}</span>}
            </button>
          ))}
        </nav>
        {sidebarOpen && <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb" }}>
          {/* Active staff member */}
          <div style={{ background: "#eef2ff", border: "1px solid #2563eb40", borderRadius: 10, padding: 10, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {activeStaff.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeStaff.name}</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>{activeStaff.role === "owner" ? "👑 Owner" : "👤 Staff"}</div>
            </div>
          </div>
          <button onClick={() => setActiveStaff(null)} style={{ fontSize: 12, color: "#2563eb", background: "#2563eb15", border: "1px solid #2563eb", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 6, fontWeight: 600 }}>🔄 Switch User</button>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8, marginBottom: 4, wordBreak: "break-all" }}>Account: {user.email}</div>
          <button onClick={() => signOut(auth)} style={{ fontSize: 11, color: "#ef4444", background: "none", border: "1px solid #ef444466", borderRadius: 8, padding: "3px 8px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>🚪 Sign Out</button>
          <br />
          <button onClick={resetAll} style={{ fontSize: 11, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>🔄 Reset All Data</button>
        </div>}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827" }}>{TAB_LABELS[tab]}</h1>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </header>
        <main style={{ flex: 1, padding: 20, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {tab === "pos" && <POSTab products={products} setProducts={setProducts} sales={sales} setSales={setSales} customers={customers} activeStaff={activeStaff} />}
          {tab === "inventory" && <InventoryTab products={products} setProducts={setProducts} deletionLogs={deletionLogs} setDeletionLogs={setDeletionLogs} user={user} activeStaff={activeStaff} />}
          {tab === "sales" && <SalesHistoryTab sales={sales} setSales={setSales} products={products} setProducts={setProducts} customers={customers} activeStaff={activeStaff} />}
          {tab === "customers" && <CustomersTab customers={customers} setCustomers={setCustomers} sales={sales} />}
          {tab === "repairs" && <RepairsTab repairs={repairs} setRepairs={setRepairs} customers={customers} setCustomers={setCustomers} activeStaff={activeStaff} />}
          {tab === "tradeins" && <TradeInsTab tradeIns={tradeIns} setTradeIns={setTradeIns} customers={customers} setCustomers={setCustomers} products={products} setProducts={setProducts} activeStaff={activeStaff} />}
          {tab === "deposits" && <DepositsTab deposits={deposits} setDeposits={setDeposits} customers={customers} setCustomers={setCustomers} products={products} setProducts={setProducts} sales={sales} setSales={setSales} activeStaff={activeStaff} />}
          {tab === "reports" && <ReportsTab sales={sales} products={products} repairs={repairs} tradeIns={tradeIns} deposits={deposits} />}
        </main>
      </div>
    </div>
  );
}