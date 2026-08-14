import { Args, Query, Resolver } from "@nestjs/graphql";

import { ProductDto } from "./dto/product.dto.js";
import { toProductDto } from "./product.mapper.js";
import { ProductService } from "./product.service.js";

@Resolver(() => ProductDto)
export class ProductResolver {
  constructor(private readonly products: ProductService) {}

  @Query(() => ProductDto, { nullable: true })
  async product(@Args("id") id: string): Promise<ProductDto | undefined> {
    const product = await this.products.findById(id);
    return product === undefined ? undefined : toProductDto(product);
  }
}
