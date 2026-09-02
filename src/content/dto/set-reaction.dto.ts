import { IsEnum } from 'class-validator';
import { ReactionValue } from '@prisma/client';

export class SetReactionDto {
  @IsEnum(ReactionValue)
  value: ReactionValue;
}
