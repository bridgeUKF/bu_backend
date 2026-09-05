import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpsertProfileDto {
  @ApiPropertyOptional({
    example: 'Slovak University of Technology',
    maxLength: 200,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  university?: string;

  @ApiPropertyOptional({ example: 'Faculty of Informatics', maxLength: 200 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  faculty?: string;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  studyYear?: number;

  @ApiPropertyOptional({
    example: 'CS student interested in backend',
    maxLength: 2000,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ example: 'Bratislava', maxLength: 150 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  city?: string;

  @ApiPropertyOptional({ example: '@ivan_petrov', maxLength: 100 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  telegram?: string;

  @ApiPropertyOptional({ example: 'https://github.com/ivan', maxLength: 200 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  github?: string;

  @ApiPropertyOptional({
    example: 'https://linkedin.com/in/ivan',
    maxLength: 200,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  linkedin?: string;

  @ApiPropertyOptional({ example: 'https://ivan.dev', maxLength: 500 })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  website?: string;

  @ApiPropertyOptional({
    example: ['backend', 'nestjs'],
    maxItems: 20,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(50, { each: true })
  @Matches(/\S/, { each: true })
  interests?: string[];
}
