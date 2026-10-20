export type ReportFilters = {
  from?: Date;
  to?: Date;
};

export type AggregateReportRow = {
  domain: string;
  metric: string;
  value: number;
  rate?: string;
  note: string;
};

export function generateAggregateCsv(rows: AggregateReportRow[]): string {
  const header = "Domain,Metric,Value,Rate,Note\n";
  const body = rows
    .map(
      r =>
        `"${r.domain}","${r.metric}",${r.value},"${r.rate || "N/A"}","${r.note.replace(/"/g, '""')}"`
    )
    .join("\n");
  return header + body;
}

export function sanitizeReportOutput<T extends Record<string, any>>(data: T): Partial<T> {
  const sanitized = { ...data };
  // Strictly delete any sensitive fields
  delete sanitized.vendorPrivateNotes;
  delete sanitized.messageBody;
  delete sanitized.identityEvidence;
  delete sanitized.buyerProfile;
  delete sanitized.phone;
  delete sanitized.email;
  return sanitized;
}
