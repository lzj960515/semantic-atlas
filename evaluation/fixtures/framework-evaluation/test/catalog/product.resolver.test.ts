import { describe, expect, it } from "vitest";

import { ProductResolver } from "../../src/catalog/product.resolver.js";

describe("ProductResolver", () => {
  it("maps the product to its GraphQL output", async () => {
    const service = {
      findById: async () => ({
        id: "product-1",
        name: "Travel Mug",
        shortDescription: "An insulated mug.",
      }),
    };
    const resolver = new ProductResolver(service as never);

    await expect(resolver.product("product-1")).resolves.toEqual({
      id: "product-1",
      displayName: "Travel Mug",
      description: "An insulated mug.",
    });
  });
});
