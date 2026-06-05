import { PageHeader } from "@/components/page-header";
import { PromptRegistryEditor } from "@/components/admin/prompt-registry-editor";

/**
 * Super-Admin → Prompt Registry.
 * Version and edit the system prompts that drive each MoM agent and the
 * client-facing chat assistant. Changes are versioned with success metrics.
 */
export default function PromptRegistryPage() {
  return (
    <>
      <PageHeader
        title="Prompt Registry"
        subtitle="Version-controlled prompts driving the agents and chat assistant."
      />
      <PromptRegistryEditor />
    </>
  );
}
