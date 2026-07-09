import { PageHeader } from "@/components/page-header";
import { AiModelConfigEditor } from "@/components/admin/ai-model-config-editor";

/**
 * Super-Admin → AI Models.
 * Per-use-case model provider/version, prompt associations, and context toggles.
 */
export default function AiModelsPage() {
  return (
    <>
      <PageHeader
        title="AI Models"
        subtitle="Configure model provider, version, prompts, and context for each assistant case."
      />
      <AiModelConfigEditor />
    </>
  );
}
