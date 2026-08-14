import { Injectable } from "@nestjs/common";

import type { Product } from "./product.entity.js";

@Injectable()
export class ProductService {
  private readonly products: Product[] = [{
    id: "product-1",
    name: "Travel Mug",
    shortDescription: "An insulated mug.",
  }];

  async findById(id: string): Promise<Product | undefined> {
    return this.products.find((product) => product.id === id);
  }
}
