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

const TABS = ["pos", "inventory", "sales", "customers", "repairs", "reports"];
const TAB_LABELS = { pos: "Point of Sale", inventory: "Inventory", sales: "Sales History", customers: "Customers", repairs: "Repairs", reports: "Reports" };
const TAB_ICONS = {
  pos: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z",
  inventory: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  sales: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  customers: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  repairs: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
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
      p.units.push({ id: uid(), imei, color, storage, cost: unitCost, grade: GRADES.includes(grade) ? grade : "", supplier, status: "in_stock" });
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
    { Name: "iPhone 15 Pro Max", SKU: "IP15PM", Category: "Smartphones", Cost: 950, Price: 1199, Quantity: "", IMEI: "353456789012345", Colour: "Natural Titanium", Storage: "256GB", Grade: "A", "Unit Cost": 920, Supplier: "PhoneStock UK" },
    { Name: "iPhone 15 Pro Max", SKU: "IP15PM", Category: "Smartphones", Cost: 950, Price: 1199, Quantity: "", IMEI: "353456789012346", Colour: "Blue Titanium", Storage: "512GB", Grade: "B", "Unit Cost": 980, Supplier: "MobileWholesale" },
    { Name: "iPhone 15 Pro Max", SKU: "IP15PM", Category: "Smartphones", Cost: 950, Price: 1199, Quantity: "", IMEI: "353456789012347", Colour: "Black Titanium", Storage: "1TB", Grade: "A", "Unit Cost": 1050, Supplier: "PhoneStock UK" },
    { Name: "USB-C Charger 65W", SKU: "USBC65", Category: "Chargers", Cost: 12, Price: 29.99, Quantity: 25, IMEI: "", Colour: "", Storage: "", Grade: "", "Unit Cost": "", Supplier: "" },
    { Name: "iPhone 15 Clear Case", SKU: "IP15CC", Category: "Cases", Cost: 5, Price: 19.99, Quantity: 40, IMEI: "", Colour: "", Storage: "", Grade: "", "Unit Cost": "", Supplier: "" },
  ];
  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [{ wch: 24 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 16 }];
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

const POSTab = ({ products, setProducts, sales, setSales, customers }) => {
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
    setCart(prev => [...prev, { cartItemId: uid(), productId: p.id, name: p.name, price: p.price, cost: unit.cost ?? p.cost ?? 0, qty: 1, imei: unit.imei, unitId: unit.id, color: unit.color || "", storage: unit.storage || "", grade: unit.grade || "" }]);
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
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6" }}>{currency(p.price)}</span>
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
                  <Btn variant="primary" style={{ padding: "6px 16px", fontSize: 13 }}>Select</Btn>
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

const InventoryTab = ({ products, setProducts }) => {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [unitsModal, setUnitsModal] = useState(null);
  const [newImei, setNewImei] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newStorage, setNewStorage] = useState("");
  const [newUnitCost, setNewUnitCost] = useState("");
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
  const del = (id) => setProducts(prev => prev.filter(p => p.id !== id));

  const addUnit = (productId) => {
    if (!newImei.trim()) return;
    const isDuplicate = products.some(p => (p.units || []).some(u => u.imei === newImei.trim()));
    if (isDuplicate) { alert("This IMEI/Serial already exists in inventory!"); return; }
    const product = products.find(p => p.id === productId);
    const unitCost = newUnitCost.trim() ? +newUnitCost : (product?.cost || 0);
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, units: [...(p.units || []), { id: uid(), imei: newImei.trim(), color: newColor.trim(), storage: newStorage.trim(), cost: unitCost, supplier: newSupplier.trim(), grade: newGrade, status: "in_stock" }] } : p));
    setNewImei("");
    setNewColor("");
    setNewStorage("");
    setNewUnitCost("");
    setNewSupplier("");
    setNewGrade("");
  };
  const removeUnit = (productId, unitId) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, units: (p.units || []).filter(u => u.id !== unitId) } : p));
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
                  <td style={{ padding: "10px 8px", fontWeight: 600, color: "#111827" }}>{p.name}</td>
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
                    {p.serialized && <button onClick={() => { setUnitsModal(p); setNewImei(""); setNewColor(""); setNewStorage(""); setNewUnitCost(""); setNewSupplier(""); setNewGrade(""); }} style={{ background: "none", border: "none", color: "#f59e0b", cursor: "pointer", marginRight: 6, fontSize: 13, fontWeight: 600 }}>Units</button>}
                    <button onClick={() => openEdit(p)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", marginRight: 6, fontSize: 13 }}>Edit</button>
                    <button onClick={() => del(p.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13 }}>Del</button>
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
          <Input label="Selling Price (£)" type="number" min={0} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
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
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.6fr 0.6fr 0.7fr 0.6fr auto", gap: 8, marginBottom: 6, alignItems: "flex-end" }}>
              <Input label="IMEI / Serial" placeholder="e.g. 353456789012350" value={newImei} onChange={e => setNewImei(e.target.value)} style={{ marginBottom: 0 }}
                onKeyDown={e => { if (e.key === "Enter") addUnit(currentUnitsProduct.id); }} />
              <Input label="Colour" placeholder="e.g. Black" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ marginBottom: 0 }} />
              <Input label="Storage" placeholder="e.g. 256GB" value={newStorage} onChange={e => setNewStorage(e.target.value)} style={{ marginBottom: 0 }} />
              <Select label="Grade" options={[{ value: "", label: "—" }, ...GRADES.map(g => ({ value: g, label: `Grade ${g}` }))]} value={newGrade} onChange={e => setNewGrade(e.target.value)} style={{ marginBottom: 0 }} />
              <Input label="Cost (£)" type="number" min={0} placeholder={String(currentUnitsProduct.cost || 0)} value={newUnitCost} onChange={e => setNewUnitCost(e.target.value)} style={{ marginBottom: 0 }} />
              <Input label="Supplier" placeholder="e.g. WeBuy" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} style={{ marginBottom: 0 }} />
              <Btn onClick={() => addUnit(currentUnitsProduct.id)} variant="success" style={{ marginBottom: 14 }}>+ Add</Btn>
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10, marginTop: -4 }}>💡 Leave Cost blank to use the product default ({currency(currentUnitsProduct.cost || 0)})</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
              <Badge color="#10b981">{currentUnitsProduct.units.filter(u => u.status === "in_stock").length} in stock</Badge>
              <span style={{ marginLeft: 8 }}><Badge color="#6b7280">{currentUnitsProduct.units.filter(u => u.status === "sold").length} sold</Badge></span>
              <span style={{ marginLeft: 8, color: "#9ca3af" }}>{currentUnitsProduct.units.length} total units</span>
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
                      <td style={{ padding: "8px", textAlign: "right", color: "#10b981", fontWeight: 600 }}>{currency(u.cost ?? currentUnitsProduct.cost ?? 0)}</td>
                      <td style={{ padding: "8px", color: "#6b7280" }}>{u.supplier || "—"}</td>
                      <td style={{ padding: "8px" }}>
                        {u.status === "in_stock" ? <Badge color="#10b981">In Stock</Badge> : <Badge color="#6b7280">Sold</Badge>}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        {u.status === "in_stock" ? (
                          <button onClick={() => removeUnit(currentUnitsProduct.id, u.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>Remove</button>
                        ) : <span style={{ color: "#9ca3af", fontSize: 11 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                  {currentUnitsProduct.units.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>No units yet. Add IMEI/Serial numbers above.</td></tr>
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
    </div>
  );
};

// ─── Sales History ──────────────────────────────────────────────────

const SalesHistoryTab = ({ sales, setSales, products, setProducts, customers }) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const now = new Date();
  const filterDate = (d) => {
    if (dateFilter === "all") return true;
    const diff = (now - new Date(d)) / 86400000;
    if (dateFilter === "today") return diff < 1;
    if (dateFilter === "week") return diff < 7;
    if (dateFilter === "month") return diff < 30;
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

    const refund = { id: uid(), amount, method: refundMethod, reason: refundReason.trim(), returnedUnits: refundItems, date: new Date().toISOString() };
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
        <Select options={[{ value: "all", label: "All Time" }, { value: "today", label: "Today" }, { value: "week", label: "This Week" }, { value: "month", label: "This Month" }]} value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ width: 140, marginBottom: 0 }} />
        <Select options={[{ value: "all", label: "All Sales" }, { value: "active", label: "Active Only" }, { value: "refunded", label: "Refunded Only" }]} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 150, marginBottom: 0 }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #d4d8e0", color: "#6b7280", textAlign: "left" }}>
              <th style={{ padding: "10px 8px" }}>Receipt #</th>
              <th style={{ padding: "10px 8px" }}>Date</th>
              <th style={{ padding: "10px 8px" }}>Customer</th>
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
                  <td style={{ padding: "10px 8px", color: "#6b7280" }}>{s.items.reduce((t, i) => t + i.qty, 0)} item(s)</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: s.refunded ? "#ef4444" : "#10b981" }}>{currency(s.total)}</td>
                  <td style={{ padding: "10px 8px" }}>{s.refunded ? <Badge color="#ef4444">Refunded</Badge> : (s.refunds || []).length > 0 ? <Badge color="#f59e0b">Partial Refund</Badge> : <Badge color="#10b981">Completed</Badge>}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>No sales found</td></tr>}
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

const RepairsTab = ({ repairs, setRepairs, customers, setCustomers }) => {
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
    const item = { customer: customerId, device: form.device, imei: form.imei, issue: form.issue, status: form.status, cost: repairCost, payment: form.payment || "cash", cashPaid: form.payment === "mix" ? (+form.cashPaid || 0) : (form.payment === "cash" ? repairCost : 0), cardPaid: form.payment === "mix" ? (repairCost - (+form.cashPaid || 0)) : (form.payment === "card" ? repairCost : 0), notes: form.notes };
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

const ReportsTab = ({ sales, products, repairs }) => {
  const [range, setRange] = useState("all");
  const now = new Date();
  const filterDate = (d) => {
    if (range === "all") return true;
    const diff = (now - new Date(d)) / 86400000;
    if (range === "today") return diff < 1;
    if (range === "week") return diff < 7;
    if (range === "month") return diff < 30;
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

  // Net (after refunds)
  const netSalesCash = salesCash - salesCashRefunded;
  const netSalesCard = salesCard - salesCardRefunded;
  const totalCashIn = netSalesCash + repairCash;
  const totalCardIn = netSalesCard + repairCard;
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
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["all", "All Time"], ["today", "Today"], ["week", "This Week"], ["month", "This Month"]].map(([v, l]) => (
          <button key={v} onClick={() => setRange(v)} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${range === v ? "#2563eb" : "#d4d8e0"}`, background: range === v ? "#2563eb15" : "transparent", color: range === v ? "#3b82f6" : "#7070a0", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{l}</button>
        ))}
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

function MainApp({ user }) {
  const [tab, setTab] = useState("pos");
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    (async () => {
      const [p, s, c, r] = await Promise.all([
        loadData("pos-products-v3", SAMPLE_PRODUCTS),
        loadData("pos-sales-v3", []),
        loadData("pos-customers-v3", []),
        loadData("pos-repairs-v3", []),
      ]);
      setProducts(p); setSales(s); setCustomers(c); setRepairs(r);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveData("pos-products-v3", products); }, [products, loaded]);
  useEffect(() => { if (loaded) saveData("pos-sales-v3", sales); }, [sales, loaded]);
  useEffect(() => { if (loaded) saveData("pos-customers-v3", customers); }, [customers, loaded]);
  useEffect(() => { if (loaded) saveData("pos-repairs-v3", repairs); }, [repairs, loaded]);

  const resetAll = async () => {
    if (!confirm("Reset ALL data? This cannot be undone.")) return;
    setProducts(SAMPLE_PRODUCTS); setSales([]); setCustomers([]); setRepairs([]);
  };

  if (!loaded) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f7fa", color: "#3b82f6", fontFamily: "'DM Sans', sans-serif", fontSize: 18 }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>Loading Phone Shop POS…</div>
    </div>
  );

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
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, wordBreak: "break-all" }}>👤 {user.email}</div>
          <button onClick={() => signOut(auth)} style={{ fontSize: 12, color: "#ef4444", background: "none", border: "1px solid #ef444466", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>🚪 Sign Out</button>
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
          {tab === "pos" && <POSTab products={products} setProducts={setProducts} sales={sales} setSales={setSales} customers={customers} />}
          {tab === "inventory" && <InventoryTab products={products} setProducts={setProducts} />}
          {tab === "sales" && <SalesHistoryTab sales={sales} setSales={setSales} products={products} setProducts={setProducts} customers={customers} />}
          {tab === "customers" && <CustomersTab customers={customers} setCustomers={setCustomers} sales={sales} />}
          {tab === "repairs" && <RepairsTab repairs={repairs} setRepairs={setRepairs} customers={customers} setCustomers={setCustomers} />}
          {tab === "reports" && <ReportsTab sales={sales} products={products} repairs={repairs} />}
        </main>
      </div>
    </div>
  );
}