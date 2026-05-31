import { z } from "zod";
import type {
  AppSettings,
  CaptureSubmitPayload,
  ResultWindowMovePayload,
  ScreenRect,
  UpdateSource
} from "../shared/types";
import { settingsPatchSchema } from "../shared/types";

const trimmedStringSchema = z.string().transform((value) => value.trim());
const finiteNumberSchema = (message: string): z.ZodNumber => z.number({ error: message }).finite(message);

const screenRectSchema: z.ZodType<ScreenRect> = z
  .object({
    x: finiteNumberSchema("selectionRect must contain finite x, y, width, and height values."),
    y: finiteNumberSchema("selectionRect must contain finite x, y, width, and height values."),
    width: finiteNumberSchema("selectionRect must contain finite x, y, width, and height values."),
    height: finiteNumberSchema("selectionRect must contain finite x, y, width, and height values.")
  })
  .superRefine((value, context) => {
    if (value.width <= 0 || value.height <= 0) {
      context.addIssue({
        code: "custom",
        message: "selectionRect must contain finite x, y, width, and height values."
      });
    }
  });

const historyIdSchema = trimmedStringSchema.refine((value) => value.length > 0, {
  message: "history id is required."
});

const retrySourceTextSchema = z.string().optional();

const captureSubmitPayloadSchema: z.ZodType<CaptureSubmitPayload> = z.object({
  displayId: z.number({ error: "displayId must be an integer." }).int("displayId must be an integer."),
  selectionRect: screenRectSchema
});

const resultWindowMovePayloadSchema: z.ZodType<ResultWindowMovePayload> = z.object({
  deltaX: finiteNumberSchema("result window movement must contain finite deltaX and deltaY values."),
  deltaY: finiteNumberSchema("result window movement must contain finite deltaX and deltaY values.")
});

const updateSourceSchema = z.enum(["mirror", "github"], {
  error: "Update source is invalid."
});

const clipboardTextSchema = z.string();

const rendererErrorSchema = z.object({
  message: trimmedStringSchema.refine((value) => value.length > 0, {
    message: "renderer error message is required."
  }),
  stack: z.string().optional()
});

function formatValidationIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    return `Unsupported settings field: ${issue.keys[0]}.`;
  }

  return issue.message;
}

function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success === true) {
    return result.data;
  }

  throw new Error(formatValidationIssue(result.error.issues[0]));
}

export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;

export function validateSettingsPatch(value: unknown): Partial<AppSettings> {
  return parseWithSchema(settingsPatchSchema, value);
}

export function validateHistoryId(value: unknown): string {
  return parseWithSchema(historyIdSchema, value);
}

export function validateRetrySourceText(value: unknown): string | undefined {
  return parseWithSchema(retrySourceTextSchema, value);
}

export function validateCaptureSubmitPayload(value: unknown): CaptureSubmitPayload {
  return parseWithSchema(captureSubmitPayloadSchema, value);
}

export function validateResultWindowMovePayload(value: unknown): ResultWindowMovePayload {
  return parseWithSchema(resultWindowMovePayloadSchema, value);
}

export function validateUpdateSource(value: unknown): UpdateSource {
  return parseWithSchema(updateSourceSchema, value);
}

export function validateClipboardText(value: unknown): string {
  return parseWithSchema(clipboardTextSchema, value);
}

export function validateRendererError(value: unknown): { message: string; stack?: string } {
  return parseWithSchema(rendererErrorSchema, value);
}
