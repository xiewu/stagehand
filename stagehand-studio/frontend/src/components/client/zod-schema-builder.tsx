"use client";

import { createContext, useCallback, useContext, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, Trash2 } from "lucide-react";
import { FieldType, SchemaField } from "@/lib/stagehandActions";

export const SchemaContext = createContext<{
  schema: SchemaField[];
  setSchema: React.Dispatch<React.SetStateAction<SchemaField[]>>;
  zodSchema: string | null;
  setZodSchema: React.Dispatch<React.SetStateAction<string | null>>;
} | null>(null);

export function useSchema() {
  const context = useContext(SchemaContext);
  if (!context) {
    throw new Error("useSchema must be used within a SchemaProvider");
  }
  return context;
}

export function ZodSchemaBuilder() {
  const { schema, setSchema, zodSchema, setZodSchema } = useSchema();
  const addField = (parentField?: SchemaField) => {
    const newField: SchemaField = {
      id: crypto.randomUUID(),
      name: "",
      type: "string",
      isOptional: false,
      isArray: false,
    };
    if (parentField) {
      parentField.children = [...(parentField.children || []), newField];
      setSchema([...schema]);
    } else {
      setSchema([...schema, newField]);
    }
  };

  const removeField = (field: SchemaField, parentField?: SchemaField) => {
    console.log("removeField", field, parentField, schema);
    if (parentField) {
      parentField.children = parentField.children?.filter(
        (f) => f.id !== field.id
      );
      setSchema([...schema]);
    } else {
      setSchema(schema.filter((f) => f.id !== field.id));
    }
  };

  const updateField = (
    fieldToUpdate: SchemaField,
    updates: Partial<SchemaField>
  ) => {
    setSchema((prevSchema) => {
      const updateFieldRecursively = (fields: SchemaField[]): SchemaField[] => {
        return fields.map((field) => {
          if (field === fieldToUpdate) {
            return { ...field, ...updates };
          }
          if (field.children) {
            return {
              ...field,
              children: updateFieldRecursively(field.children),
            };
          }
          return field;
        });
      };
      return updateFieldRecursively(prevSchema);
    });
  };

  const generateZodSchema = useCallback(
    (fields: SchemaField[], indent = ""): string => {
      return fields
        .map((field) => {
          let fieldSchema = `${indent}${field.name}: z.`;
          switch (field.type) {
            case "string":
              fieldSchema += "string()";
              break;
            case "number":
              fieldSchema += "number()";
              break;
            case "boolean":
              fieldSchema += "boolean()";
              break;
            case "object":
              fieldSchema += `object({\n${generateZodSchema(
                field.children || [],
                indent + "  "
              )}\n${indent}})`;
              break;
          }
          if (field.isArray) {
            fieldSchema = `${fieldSchema}.array()`;
          }
          if (field.isOptional) {
            fieldSchema += ".optional()";
          }
          return fieldSchema;
        })
        .join(",\n");
    },
    []
  );

  const handleGenerateCode = useCallback(() => {
    const generatedSchema = `z.object({\n${generateZodSchema(
      schema,
      "  "
    )}\n});`;
    setZodSchema(generatedSchema);
  }, [schema, generateZodSchema, setZodSchema]);

  useEffect(() => {
    handleGenerateCode();
  }, [schema, zodSchema, handleGenerateCode]);

  const renderField = (field: SchemaField, parentField?: SchemaField) => (
    <Card key={field.id} className="mb-4">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-4 mb-4">
          <div className="flex gap-2">
            <Input
              placeholder="Field name"
              value={field.name}
              onChange={(e) => updateField(field, { name: e.target.value })}
              className="flex-grow"
            />
            <Select
              value={field.type}
              onValueChange={(value: FieldType) =>
                updateField(field, { type: value })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="object">Object</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`optional-${field.name}`}
                checked={field.isOptional}
                onCheckedChange={(checked) =>
                  updateField(field, { isOptional: checked as boolean })
                }
              />
              <Label htmlFor={`optional-${field.name}`}>Optional</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`array-${field.name}`}
                checked={field.isArray}
                onCheckedChange={(checked) =>
                  updateField(field, { isArray: checked as boolean })
                }
              />
              <Label htmlFor={`array-${field.name}`}>Array</Label>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeField(field, parentField)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {field.type === "object" && (
          <div className="pl-4 border-l-2 border-gray-200">
            {field.children?.map((childField) =>
              renderField(childField, field)
            )}
            <Button variant="outline" size="sm" onClick={() => addField(field)}>
              <PlusCircle className="h-4 w-4 mr-2" /> Add Field
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4">
        <Button onClick={() => addField()}>
          <PlusCircle className="h-4 w-4 mr-2" /> Add Field
        </Button>
      </div>
      {schema.map((field) => renderField(field))}
      {zodSchema && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Generated Zod Schema</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto">
              <code>{zodSchema}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
