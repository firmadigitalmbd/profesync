"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { WithdrawalReport } from "@/lib/retiro-data";

async function loadImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  }
}

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/** Informe de retiro en PDF: datos del retiro, notas hasta la fecha, faltas con sus fechas y observaciones. */
export async function buildWithdrawalPdf(data: WithdrawalReport): Promise<File> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = 56;

  const ensureSpace = (needed: number) => {
    if (y + needed > height - 50) {
      doc.addPage();
      y = 56;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(data.institution || "Informe de retiro", margin, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Informe de retiro de estudiante", margin, y);
  y += 16;
  doc.setTextColor(100);
  doc.text(`Año lectivo ${data.year}`, margin, y);
  doc.setTextColor(0);
  y += 22;

  const photo = data.student.photoUrl ? await loadImage(data.student.photoUrl) : null;
  const boxHeight = 78;
  doc.setDrawColor(210);
  doc.roundedRect(margin, y, width - margin * 2, boxHeight, 6, 6);
  let textX = margin + 14;
  if (photo) {
    try {
      doc.addImage(photo, "JPEG", margin + 10, y + 10, 56, 56);
      textX = margin + 80;
    } catch {
      // formato no soportado: se omite la foto
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(data.student.name, textX, y + 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    `Curso: ${data.courseLabel}${data.student.document ? `   ·   Documento: ${data.student.document}` : ""}`,
    textX,
    y + 42
  );
  doc.text(`Fecha de retiro: ${fmt(data.withdrawnOn)}   ·   Motivo: ${data.reason}`, textX, y + 58);
  doc.setTextColor(0);
  y += boxHeight + 16;

  if (data.note?.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Nota del retiro", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(data.note.trim(), width - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 13 + 12;
  }

  // Notas por materia (hasta la fecha de retiro)
  const periodLabels = data.subjects[0]?.periods.map((p) => p.label) ?? [];
  autoTable(doc, {
    startY: y,
    head: [["Materia", ...periodLabels, "Definitiva", "Desempeño", "Faltas"]],
    body: data.subjects.map((s) => [
      s.name,
      ...s.periods.map((p) => (p.grade === null ? "—" : p.grade.toFixed(1))),
      s.final === null ? "—" : s.final.toFixed(1),
      s.performance,
      String(s.absences),
    ]),
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [31, 41, 55] },
    columnStyles: Object.fromEntries(
      Array.from({ length: periodLabels.length + 3 }, (_, i) => [i + 1, { halign: "center" as const }])
    ),
    didParseCell: (hook) => {
      if (hook.section === "body" && hook.column.index >= 1 && hook.column.index <= periodLabels.length + 1) {
        const value = Number(hook.cell.raw);
        if (Number.isFinite(value) && hook.cell.raw !== "—" && value < data.pass) {
          hook.cell.styles.textColor = [192, 57, 43];
        }
      }
    },
  });
  y = lastY(doc) + 22;

  // Faltas con fechas
  ensureSpace(60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Inasistencias por materia", margin, y);
  y += 8;
  const withAbsences = data.subjects.filter((s) => s.absences > 0 || s.excuses > 0 || s.late > 0);
  if (withAbsences.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Sin inasistencias registradas.", margin, y + 14);
    y += 32;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Materia", "Faltas", "Excusas", "Tardanzas", "Fechas de las faltas"]],
      body: withAbsences.map((s) => [
        s.name,
        String(s.absences),
        String(s.excuses),
        String(s.late),
        s.absenceDates.length ? s.absenceDates.map(fmt).join(", ") : "—",
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [31, 41, 55] },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" } },
    });
    y = lastY(doc) + 22;
  }

  // Observaciones
  if (data.observations.length > 0) {
    ensureSpace(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Observador", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Tipo", "Observación"]],
      body: data.observations.map((o) => [fmt(o.date), o.kind, o.note]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [31, 41, 55] },
      columnStyles: { 0: { cellWidth: 64 }, 1: { cellWidth: 80 } },
    });
    y = lastY(doc) + 22;
  }

  ensureSpace(40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Docente: ${data.teacherName}`, margin, y);
  doc.setFontSize(8);
  doc.text("Generado con ProfeSync", margin, height - 30);

  const safe = data.student.name.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "_");
  return new File([doc.output("blob")], `Retiro_${safe}.pdf`, { type: "application/pdf" });
}
