import { getTableColumns } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

type JsonSchemaProperty = {
  type?: string;
  format?: string;
  nullable?: boolean;
  description?: string;
  enum?: string[];
  default?: any;
  items?: any;
  properties?: Record<string, any>;
  minimum?: number;
  maximum?: number;
  deprecated?: boolean;
  $ref?: string;
};

type PropertyOverride = Partial<JsonSchemaProperty> & {
  omit?: boolean;
};

export interface SchemaOptions {
  description?: string;
  example?: Record<string, any>;
  deprecated?: boolean;
  exclude?: string[];
  required?: string[];
  overrides?: Record<string, PropertyOverride>;
}

function isPrimitiveDefault(val: any): boolean {
  if (val === null || val === undefined) return false;
  const t = typeof val;
  return t === 'string' || t === 'number' || t === 'boolean';
}

function columnToJsonSchema(col: any, isArrayItem = false): JsonSchemaProperty {
  const prop: JsonSchemaProperty = {};

  switch (col.columnType) {
    case 'PgText':
    case 'PgVarchar':
      prop.type = 'string';
      break;
    case 'PgSerial':
      prop.type = 'integer';
      break;
    case 'PgInteger':
      prop.type = 'integer';
      break;
    case 'PgBoolean':
      prop.type = 'boolean';
      break;
    case 'PgTimestamp':
      prop.type = 'string';
      prop.format = 'date-time';
      break;
    case 'PgDateString':
      prop.type = 'string';
      prop.format = 'date';
      break;
    case 'PgJsonb':
      prop.type = 'object';
      break;
    case 'PgCustomColumn':
      prop.type = 'number';
      break;
    case 'PgArray': {
      prop.type = 'array';
      if (col.baseColumn) {
        const itemSchema = columnToJsonSchema(col.baseColumn, true);
        prop.items = itemSchema;
      } else {
        prop.items = { type: 'string' };
      }
      break;
    }
    default:
      prop.type = 'string';
      break;
  }

  if (!isArrayItem && !col.notNull && col.columnType !== 'PgSerial') {
    prop.nullable = true;
  }

  if (col.hasDefault && isPrimitiveDefault(col.default)) {
    prop.default = col.default;
  }

  return prop;
}

export function drizzleTableToOpenApiSchema(
  table: PgTable,
  options: SchemaOptions = {}
): Record<string, any> {
  const columns = getTableColumns(table);
  const properties: Record<string, any> = {};
  const excludeSet = new Set(options.exclude || []);
  const overrides = options.overrides || {};

  for (const [jsKey, col] of Object.entries(columns)) {
    if (excludeSet.has(jsKey)) continue;

    const override = overrides[jsKey];
    if (override?.omit) continue;

    let prop = columnToJsonSchema(col as any);

    if (override) {
      const { omit, ...rest } = override;
      prop = { ...prop, ...rest };
    }

    properties[jsKey] = prop;
  }

  const schema: Record<string, any> = {
    type: 'object',
    properties,
  };

  if (options.description) {
    schema.description = options.description;
  }

  if (options.required && options.required.length > 0) {
    schema.required = options.required;
  }

  if (options.example) {
    schema.example = options.example;
  }

  if (options.deprecated) {
    schema.deprecated = true;
  }

  return schema;
}

export function createRequestSchema(
  table: PgTable,
  options: SchemaOptions & {
    extraExclude?: string[];
  } = {}
): Record<string, any> {
  const defaultExclude = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'deletedBy', 'isDemo'];
  const exclude = [
    ...defaultExclude,
    ...(options.extraExclude || []),
    ...(options.exclude || []),
  ];

  return drizzleTableToOpenApiSchema(table, {
    ...options,
    exclude: [...new Set(exclude)],
  });
}
