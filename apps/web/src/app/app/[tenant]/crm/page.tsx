import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ModuleGate } from "@/components/module-gate";
import { CrmHub } from "@/components/crm/crm-hub";
import { getTenant, getCrmContacts, getCrmOpportunities } from "@/lib/mock-data";

export default async function CrmPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = getTenant(slug);
  if (!tenant) notFound();

  // Starter: mock fixtures. Production fetches /crm/contacts + /crm/opportunities via BFF.
  const contacts = getCrmContacts(tenant);
  const opportunities = getCrmOpportunities(tenant);

  return (
    <ModuleGate tenant={tenant} moduleKey="crm">
      <PageHeader
        title="CRM"
        subtitle="Contacts and pipeline — where Acquisition leads become deals."
        actions={
          <Button variant="secondary" size="sm" disabled title="Coming soon — assistant + n8n create flows">
            Add contact
          </Button>
        }
      />
      <CrmHub slug={slug} initialContacts={contacts} initialOpportunities={opportunities} />
    </ModuleGate>
  );
}
