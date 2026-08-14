import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class ProductDto {
  @Field()
  id!: string;

  @Field()
  displayName!: string;

  @Field()
  description!: string;
}
