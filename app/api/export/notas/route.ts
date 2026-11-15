import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth";
import { computeResults, loadSubjectContext } from "@/lib/notas-data";
import { gradeMap, periodGrade, performanceLabel } from "@/lib/grades";

/** Planilla de la materia en Excel: una hoja por periodo + hoja de definitivas. */
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const subjectId = new URL(request.url).searchParams.get("subject");
  if (!subjectId) return NextResponse.json({ error: "Falta la materia" }, { status: 400 });

  const ctx = await loadSubjectContext(subjectId);
  if (!ctx) return NextResponse.json({ error: "Materia no encontrada" }, { status: 404 });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ProfeSync";
  const title = `${ctx.institution?.name ?? ""} · ${ctx.course.grade} ${ctx.course.section} · ${ctx.subject.name} · ${ctx.year.year}`;
  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };

  const styleHeader = (row: ExcelJS.Row) => {
    row.font = { bold: true };
    row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    row.eachCell((cell) => {
      cell.fill = headerFill;
      cell.border = { bottom: { style: "thin" } };
    });
  };

  for (const period of ctx.periods) {
    const sheet = workbook.addWorksheet(period.name.slice(0, 31));
    const acts = ctx.activities.filter((a) => a.period_id === period.id);

    sheet.addRow([title]).font = { bold: true, size: 13 };
    sheet.addRow([`${period.name} — escala ${ctx.year.scale_min} a ${ctx.year.scale_max}`]);
    sheet.addRow([]);

    const header = sheet.addRow([
      "#",
      "Apellidos y nombres",
      "Documento",
      ...acts.map((a) => `${a.name} (${a.weight}%)`),
      "Nota del periodo",
    ]);
    styleHeader(header);

    ctx.roster.forEach((r, i) => {
      const mine = gradeMap(ctx.grades.filter((g) => g.enrollment_id === r.enrollment.id));
      const result = periodGrade(acts, mine);
      sheet.addRow([
        i + 1,
        `${r.student.last_name} ${r.student.first_name}`,
        r.student.document_number ?? "",
        ...acts.map((a) => mine.get(a.id) ?? ""),
        result.value ?? "",
      ]);
    });

    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 34;
    sheet.getColumn(3).width = 14;
    for (let c = 4; c <= 3 + acts.length + 1; c++) sheet.getColumn(c).width = 16;
    sheet.eachRow((row, n) => {
      if (n >= 4) row.eachCell((cell, col) => { if (col > 3) cell.alignment = { horizontal: "center" }; });
    });
  }

  const sheet = workbook.addWorksheet("Definitivas");
  sheet.addRow([title]).font = { bold: true, size: 13 };
  sheet.addRow([
    "Fórmula: " +
      (ctx.year.final_formula.length
        ? ctx.year.final_formula
        : ctx.periods.map((p) => ({ period: p.number, weight: p.weight }))
      )
        .map((f) => `P${f.period} ${f.weight}%`)
        .join(" + "),
  ]);
  sheet.addRow([]);
  styleHeader(
    sheet.addRow([
      "#",
      "Apellidos y nombres",
      "Documento",
      ...ctx.periods.map((p) => `P${p.number}`),
      "Nota final",
      "Desempeño",
    ])
  );
  computeResults(ctx).forEach((r, i) => {
    sheet.addRow([
      i + 1,
      `${r.row.student.last_name} ${r.row.student.first_name}`,
      r.row.student.document_number ?? "",
      ...ctx.periods.map((p) => r.periodGrades.get(p.number) ?? ""),
      r.final ?? "",
      performanceLabel(r.final, ctx.year.scale_min, ctx.year.scale_max, ctx.year.pass_grade),
    ]);
  });
  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 34;
  sheet.getColumn(3).width = 14;
  for (let c = 4; c <= 3 + ctx.periods.length + 2; c++) sheet.getColumn(c).width = 14;

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `Notas ${ctx.course.grade}${ctx.course.section} ${ctx.subject.name} ${ctx.year.year}.xlsx`
    .replace(/[^\w .-]/g, "")
    .trim();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
