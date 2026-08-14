import { ProductDto } from "./dto/product.dto.js";
import type { Product } from "./product.entity.js";

export function toProductDto(product: Product): ProductDto {
  return {
    id: product.id,
    displayName: product.name,
    description: product.shortDescription,
  };
}
