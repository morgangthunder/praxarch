"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const GUIDANCE: Record<string, { authority: string; note: string }> = {
  IE: { authority: "Revenue + CRO", note: "VAT (bi-monthly), Corporation Tax (CT1), Annual Return (B1)." },
  GB: { authority: "HMRC + Companies House", note: "VAT (quarterly), Corporation Tax (CT600), Confirmation Statement." },
  US: { authority: "IRS + State", note: "Federal income tax, state sales tax, quarterly estimated payments." },
  DE: { authority: "Finanzamt", note: "Umsatzsteuer (monthly/quarterly), Körperschaftsteuer, annual accounts." },
};

/**
 * Country selector that tailors filing guidance. Selecting a jurisdiction
 * configures which obligations the Finance agent tracks and where to file.
 */
export function CountryGuidance() {
  const [country, setCountry] = useState("IE");
  const g = GUIDANCE[country];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jurisdiction</CardTitle>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="h-7 rounded-lg border border-border-subtle bg-surface-base px-2 text-xs text-content-primary outline-none focus:border-border-strong"
        >
          <option value="IE">Ireland</option>
          <option value="GB">United Kingdom</option>
          <option value="US">United States</option>
          <option value="DE">Germany</option>
        </select>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="text-sm">
          <span className="text-content-muted">Files with: </span>
          <span className="text-content-primary">{g.authority}</span>
        </div>
        <p className="text-xs text-content-muted">{g.note}</p>
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-base px-3 py-4 text-center">
          <p className="text-xs text-content-muted">
            Drop bank statements (PDF/CSV) to auto-generate required accounts.
          </p>
          <Button variant="secondary" size="sm" className="mt-2">Upload statements</Button>
        </div>
      </CardBody>
    </Card>
  );
}
