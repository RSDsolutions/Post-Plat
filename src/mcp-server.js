import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const server = new Server(
  {
    name: "supabase-mcp",
    version: "1.0.0",
  },
  {
    tools: [
      {
        name: "query_table",
        description: "Query data from any Supabase table with filters",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
            select: {
              type: "string",
              description: "Columns to select (default: *)",
            },
            filter_column: {
              type: "string",
              description: "Column to filter by",
            },
            filter_value: {
              type: "string",
              description: "Value to filter for",
            },
            order_by: {
              type: "string",
              description: "Column to order by",
            },
            ascending: {
              type: "boolean",
              description: "Order ascending or descending",
            },
            limit: {
              type: "integer",
              description: "Limit results",
            },
          },
          required: ["table"],
        },
      },
      {
        name: "insert_record",
        description: "Insert a new record into a table",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
            data: {
              type: "object",
              description: "Data to insert",
            },
          },
          required: ["table", "data"],
        },
      },
      {
        name: "update_record",
        description: "Update a record in a table",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
            id: {
              type: "string",
              description: "Record ID",
            },
            data: {
              type: "object",
              description: "Data to update",
            },
          },
          required: ["table", "id", "data"],
        },
      },
      {
        name: "delete_record",
        description: "Delete a record from a table",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
            id: {
              type: "string",
              description: "Record ID",
            },
          },
          required: ["table", "id"],
        },
      },
      {
        name: "list_tables",
        description: "List all tables in the database",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "execute_sql",
        description: "Execute raw SQL query (use with caution)",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "SQL query to execute",
            },
          },
          required: ["sql"],
        },
      },
    ],
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_table",
        description: "Query data from any Supabase table with filters",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
            select: {
              type: "string",
              description: "Columns to select (default: *)",
            },
            filter_column: {
              type: "string",
              description: "Column to filter by",
            },
            filter_value: {
              type: "string",
              description: "Value to filter for",
            },
            order_by: {
              type: "string",
              description: "Column to order by",
            },
            ascending: {
              type: "boolean",
              description: "Order ascending or descending",
            },
            limit: {
              type: "integer",
              description: "Limit results",
            },
          },
          required: ["table"],
        },
      },
      {
        name: "insert_record",
        description: "Insert a new record into a table",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
            data: {
              type: "object",
              description: "Data to insert",
            },
          },
          required: ["table", "data"],
        },
      },
      {
        name: "update_record",
        description: "Update a record in a table",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
            id: {
              type: "string",
              description: "Record ID",
            },
            data: {
              type: "object",
              description: "Data to update",
            },
          },
          required: ["table", "id", "data"],
        },
      },
      {
        name: "delete_record",
        description: "Delete a record from a table",
        inputSchema: {
          type: "object",
          properties: {
            table: {
              type: "string",
              description: "Table name",
            },
            id: {
              type: "string",
              description: "Record ID",
            },
          },
          required: ["table", "id"],
        },
      },
      {
        name: "list_tables",
        description: "List all tables in the database",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "execute_sql",
        description: "Execute raw SQL query (use with caution)",
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description: "SQL query to execute",
            },
          },
          required: ["sql"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request;

  try {
    switch (name) {
      case "query_table": {
        let query = supabase.from(args.table).select(args.select || "*");

        if (args.filter_column && args.filter_value) {
          query = query.eq(args.filter_column, args.filter_value);
        }

        if (args.order_by) {
          query = query.order(args.order_by, {
            ascending: args.ascending !== false,
          });
        }

        if (args.limit) {
          query = query.limit(args.limit);
        }

        const { data, error } = await query;

        if (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error querying ${args.table}: ${error.message}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Query successful. Retrieved ${data?.length || 0} records:\n${JSON.stringify(
                data,
                null,
                2
              )}`,
            },
          ],
        };
      }

      case "insert_record": {
        const { data, error } = await supabase
          .from(args.table)
          .insert([args.data])
          .select();

        if (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error inserting into ${args.table}: ${error.message}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Record inserted successfully:\n${JSON.stringify(
                data,
                null,
                2
              )}`,
            },
          ],
        };
      }

      case "update_record": {
        const { data, error } = await supabase
          .from(args.table)
          .update(args.data)
          .eq("id", args.id)
          .select();

        if (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error updating ${args.table}: ${error.message}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Record updated successfully:\n${JSON.stringify(
                data,
                null,
                2
              )}`,
            },
          ],
        };
      }

      case "delete_record": {
        const { error } = await supabase
          .from(args.table)
          .delete()
          .eq("id", args.id);

        if (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error deleting from ${args.table}: ${error.message}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Record deleted successfully from ${args.table}`,
            },
          ],
        };
      }

      case "list_tables": {
        const { data, error } = await supabase
          .from("information_schema.tables")
          .select("table_name")
          .eq("table_schema", "public");

        if (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error listing tables: ${error.message}`,
              },
            ],
            isError: true,
          };
        }

        const tables = data?.map((t) => t.table_name) || [];
        return {
          content: [
            {
              type: "text",
              text: `Tables in database:\n${tables.join("\n")}`,
            },
          ],
        };
      }

      case "execute_sql": {
        const { data, error } = await supabase.rpc("execute_sql", {
          sql: args.sql,
        });

        if (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error executing SQL: ${error.message}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `SQL executed successfully:\n${JSON.stringify(
                data,
                null,
                2
              )}`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Server error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
