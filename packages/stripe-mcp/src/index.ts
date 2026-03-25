#!/usr/bin/env node
/**
 * RAWagon Stripe MCP Server
 *
 * Exposes Stripe payment operations as MCP tools.
 * The Stripe client is lazily initialized on first tool call so that
 * the MCP `initialize` handshake never blocks on network I/O.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Lazy Stripe client — only constructed when a tool is first invoked
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const apiKey = process.env["STRIPE_SECRET_KEY"];
  if (!apiKey) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is required. " +
        "Set it before starting the server."
    );
  }

  _stripe = new Stripe(apiKey, { apiVersion: "2025-02-24.acacia" });
  return _stripe;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "stripe_list_customers",
    description: "List Stripe customers with optional email filter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        email: {
          type: "string",
          description: "Filter by exact email address (optional).",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (1-100, default 10).",
        },
      },
    },
  },
  {
    name: "stripe_create_customer",
    description: "Create a new Stripe customer.",
    inputSchema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Customer email address." },
        name: { type: "string", description: "Customer full name." },
        phone: { type: "string", description: "Customer phone number." },
        metadata: {
          type: "object",
          description: "Arbitrary key/value metadata.",
        },
      },
      required: ["email"],
    },
  },
  {
    name: "stripe_list_payment_intents",
    description: "List recent PaymentIntents.",
    inputSchema: {
      type: "object" as const,
      properties: {
        customer: {
          type: "string",
          description: "Filter by customer ID (optional).",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (1-100, default 10).",
        },
      },
    },
  },
  {
    name: "stripe_create_payment_intent",
    description: "Create a PaymentIntent to collect payment.",
    inputSchema: {
      type: "object" as const,
      properties: {
        amount: {
          type: "number",
          description: "Amount in smallest currency unit (e.g. cents for USD).",
        },
        currency: {
          type: "string",
          description: 'Three-letter ISO currency code, e.g. "usd".',
        },
        customer: {
          type: "string",
          description: "Stripe customer ID to attach (optional).",
        },
        description: { type: "string", description: "Payment description." },
        metadata: {
          type: "object",
          description: "Arbitrary key/value metadata.",
        },
      },
      required: ["amount", "currency"],
    },
  },
  {
    name: "stripe_retrieve_balance",
    description: "Retrieve the current Stripe account balance.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "stripe_list_products",
    description: "List Stripe products.",
    inputSchema: {
      type: "object" as const,
      properties: {
        active: {
          type: "boolean",
          description: "Filter by active status (optional).",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (1-100, default 10).",
        },
      },
    },
  },
  {
    name: "stripe_create_product",
    description: "Create a new Stripe product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Product name." },
        description: { type: "string", description: "Product description." },
        metadata: {
          type: "object",
          description: "Arbitrary key/value metadata.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "stripe_list_prices",
    description: "List Stripe prices, optionally filtered by product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        product: {
          type: "string",
          description: "Filter by product ID (optional).",
        },
        active: {
          type: "boolean",
          description: "Filter by active status (optional).",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (1-100, default 10).",
        },
      },
    },
  },
  {
    name: "stripe_create_price",
    description: "Create a price for an existing product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        product: { type: "string", description: "Product ID." },
        unit_amount: {
          type: "number",
          description: "Amount in smallest currency unit.",
        },
        currency: {
          type: "string",
          description: 'Three-letter ISO currency code, e.g. "usd".',
        },
        recurring_interval: {
          type: "string",
          enum: ["day", "week", "month", "year"],
          description: "Billing interval for subscriptions (optional).",
        },
      },
      required: ["product", "unit_amount", "currency"],
    },
  },
  {
    name: "stripe_list_subscriptions",
    description: "List Stripe subscriptions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        customer: {
          type: "string",
          description: "Filter by customer ID (optional).",
        },
        status: {
          type: "string",
          description: 'Filter by status, e.g. "active" (optional).',
        },
        limit: {
          type: "number",
          description: "Maximum number of results (1-100, default 10).",
        },
      },
    },
  },
  {
    name: "stripe_list_invoices",
    description: "List Stripe invoices.",
    inputSchema: {
      type: "object" as const,
      properties: {
        customer: {
          type: "string",
          description: "Filter by customer ID (optional).",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (1-100, default 10).",
        },
      },
    },
  },
  {
    name: "stripe_list_refunds",
    description: "List Stripe refunds.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of results (1-100, default 10).",
        },
      },
    },
  },
  {
    name: "stripe_create_refund",
    description: "Refund a charge or PaymentIntent.",
    inputSchema: {
      type: "object" as const,
      properties: {
        payment_intent: {
          type: "string",
          description: "PaymentIntent ID to refund.",
        },
        amount: {
          type: "number",
          description:
            "Amount to refund in smallest currency unit (omit for full refund).",
        },
        reason: {
          type: "string",
          enum: ["duplicate", "fraudulent", "requested_by_customer"],
          description: "Reason for refund (optional).",
        },
      },
      required: ["payment_intent"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;

async function handleTool(name: string, args: Args): Promise<string> {
  const stripe = getStripe();

  switch (name) {
    case "stripe_list_customers": {
      const params: Stripe.CustomerListParams = {
        limit: (args["limit"] as number | undefined) ?? 10,
      };
      if (args["email"]) params.email = args["email"] as string;
      const list = await stripe.customers.list(params);
      return JSON.stringify(list.data, null, 2);
    }

    case "stripe_create_customer": {
      const customerParams: Stripe.CustomerCreateParams = {
        email: args["email"] as string,
      };
      if (args["name"]) customerParams.name = args["name"] as string;
      if (args["phone"]) customerParams.phone = args["phone"] as string;
      if (args["metadata"])
        customerParams.metadata = args["metadata"] as Record<string, string>;
      const customer = await stripe.customers.create(customerParams);
      return JSON.stringify(customer, null, 2);
    }

    case "stripe_list_payment_intents": {
      const params: Stripe.PaymentIntentListParams = {
        limit: (args["limit"] as number | undefined) ?? 10,
      };
      if (args["customer"]) params.customer = args["customer"] as string;
      const list = await stripe.paymentIntents.list(params);
      return JSON.stringify(list.data, null, 2);
    }

    case "stripe_create_payment_intent": {
      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount: args["amount"] as number,
        currency: args["currency"] as string,
      };
      if (args["customer"]) intentParams.customer = args["customer"] as string;
      if (args["description"])
        intentParams.description = args["description"] as string;
      if (args["metadata"])
        intentParams.metadata = args["metadata"] as Record<string, string>;
      const intent = await stripe.paymentIntents.create(intentParams);
      return JSON.stringify(intent, null, 2);
    }

    case "stripe_retrieve_balance": {
      const balance = await stripe.balance.retrieve();
      return JSON.stringify(balance, null, 2);
    }

    case "stripe_list_products": {
      const params: Stripe.ProductListParams = {
        limit: (args["limit"] as number | undefined) ?? 10,
      };
      if (args["active"] !== undefined)
        params.active = args["active"] as boolean;
      const list = await stripe.products.list(params);
      return JSON.stringify(list.data, null, 2);
    }

    case "stripe_create_product": {
      const productParams: Stripe.ProductCreateParams = {
        name: args["name"] as string,
      };
      if (args["description"])
        productParams.description = args["description"] as string;
      if (args["metadata"])
        productParams.metadata = args["metadata"] as Record<string, string>;
      const product = await stripe.products.create(productParams);
      return JSON.stringify(product, null, 2);
    }

    case "stripe_list_prices": {
      const params: Stripe.PriceListParams = {
        limit: (args["limit"] as number | undefined) ?? 10,
      };
      if (args["product"]) params.product = args["product"] as string;
      if (args["active"] !== undefined) params.active = args["active"] as boolean;
      const list = await stripe.prices.list(params);
      return JSON.stringify(list.data, null, 2);
    }

    case "stripe_create_price": {
      const priceParams: Stripe.PriceCreateParams = {
        product: args["product"] as string,
        unit_amount: args["unit_amount"] as number,
        currency: args["currency"] as string,
      };
      if (args["recurring_interval"]) {
        priceParams.recurring = {
          interval: args["recurring_interval"] as Stripe.PriceCreateParams.Recurring.Interval,
        };
      }
      const price = await stripe.prices.create(priceParams);
      return JSON.stringify(price, null, 2);
    }

    case "stripe_list_subscriptions": {
      const params: Stripe.SubscriptionListParams = {
        limit: (args["limit"] as number | undefined) ?? 10,
      };
      if (args["customer"]) params.customer = args["customer"] as string;
      if (args["status"])
        params.status =
          args["status"] as Stripe.SubscriptionListParams.Status;
      const list = await stripe.subscriptions.list(params);
      return JSON.stringify(list.data, null, 2);
    }

    case "stripe_list_invoices": {
      const params: Stripe.InvoiceListParams = {
        limit: (args["limit"] as number | undefined) ?? 10,
      };
      if (args["customer"]) params.customer = args["customer"] as string;
      const list = await stripe.invoices.list(params);
      return JSON.stringify(list.data, null, 2);
    }

    case "stripe_list_refunds": {
      const params: Stripe.RefundListParams = {
        limit: (args["limit"] as number | undefined) ?? 10,
      };
      const list = await stripe.refunds.list(params);
      return JSON.stringify(list.data, null, 2);
    }

    case "stripe_create_refund": {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: args["payment_intent"] as string,
      };
      if (args["amount"]) refundParams.amount = args["amount"] as number;
      if (args["reason"])
        refundParams.reason =
          args["reason"] as Stripe.RefundCreateParams.Reason;
      const refund = await stripe.refunds.create(refundParams);
      return JSON.stringify(refund, null, 2);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

async function main() {
  const server = new Server(
    { name: "stripe-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // List available tools — no Stripe API call, responds immediately
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  // Execute a tool — Stripe client is created lazily here
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await handleTool(name, (args ?? {}) as Args);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep stderr quiet so MCP host doesn't confuse it with protocol output
  process.stderr.write(
    "[stripe-mcp] Server ready. Set STRIPE_SECRET_KEY before calling tools.\n"
  );
}

main().catch((err) => {
  process.stderr.write(`[stripe-mcp] Fatal: ${err}\n`);
  process.exit(1);
});
