// Types for the generated (gitignored) ./model-data.js bundle produced by prebuild.js.
export interface OmProp { name: string; type: string; nullable?: boolean; readonly?: boolean; default?: string }
export interface OmClass { name: string; parent?: string; props?: Array<OmProp> }
export interface OmEnumMember { key: string; value?: string | number }
export interface OmEnum { name: string; members: Array<OmEnumMember> }
export interface OmModel { classes: Record<string, OmClass>; enums: Record<string, OmEnum> }
export interface OmDesc { summary?: string; remarks?: string; sbcProperty?: boolean }
export type OmDescriptionEntry = Record<string, OmDesc> & { __class__?: OmDesc };
export type OmDescriptions = Record<string, OmDescriptionEntry>;

export const omModel: OmModel;
export const omDescriptions: OmDescriptions;
export const MODEL_REF: string;
export const DSF_REF_LABEL: string;
