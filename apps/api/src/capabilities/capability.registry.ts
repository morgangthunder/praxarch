import { BadRequestException } from "@nestjs/common";
import {
  CapabilityDescriptor,
  CapabilitySchema,
  CapabilitySummary,
  toSummary,
} from "./capability.types";

/**
 * In-memory registry of typed capabilities. A single source of truth that the
 * UI (`POST /capabilities/:id/invoke`), the in-app assistant (tool-calling), and
 * a future external MCP server all dispatch through.
 */
export class CapabilityRegistry {
  private readonly byId = new Map<string, CapabilityDescriptor>();

  register(descriptors: CapabilityDescriptor[]): void {
    for (const d of descriptors) {
      if (this.byId.has(d.id)) throw new Error(`Duplicate capability id: ${d.id}`);
      this.byId.set(d.id, d);
    }
  }

  get(id: string): CapabilityDescriptor | undefined {
    return this.byId.get(id);
  }

  list(): CapabilitySummary[] {
    return [...this.byId.values()].map(toSummary);
  }

  /**
   * Light schema validation — checks required keys exist and primitive types
   * match. Coerces nothing; throws BadRequest on the first violation. Adequate
   * for the prototype (the wrapped services do the deep domain validation).
   */
  validate(schema: CapabilitySchema, input: Record<string, unknown>): void {
    for (const key of schema.required ?? []) {
      if (input[key] === undefined || input[key] === null || input[key] === "") {
        throw new BadRequestException(`Missing required field: ${key}`);
      }
    }
    for (const [key, field] of Object.entries(schema.properties)) {
      const value = input[key];
      if (value === undefined || value === null) continue;
      const ok =
        field.type === "array"
          ? Array.isArray(value)
          : field.type === "number"
            ? typeof value === "number"
            : field.type === "boolean"
              ? typeof value === "boolean"
              : typeof value === "string";
      if (!ok) throw new BadRequestException(`Field ${key} must be a ${field.type}`);
      if (field.enum && typeof value === "string" && !field.enum.includes(value)) {
        throw new BadRequestException(`Field ${key} must be one of: ${field.enum.join(", ")}`);
      }
    }
  }
}
