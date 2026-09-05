import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ReactionValue } from '@prisma/client';

export class SetReactionDto {
  @ApiProperty({ enum: ReactionValue, example: ReactionValue.LIKE })
  @IsEnum(ReactionValue)
  value: ReactionValue;
}
