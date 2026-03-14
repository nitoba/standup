import { Controller, Get, Header } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { SCALAR_DOCUMENTATION_PATH } from "../../openapi/openapi.constants";
import { renderScalarApiReference } from "../../openapi/render-scalar-api-reference";

@ApiExcludeController()
@Controller()
export class ApiReferenceController {
  @Get(SCALAR_DOCUMENTATION_PATH)
  @Header("content-type", "text/html; charset=utf-8")
  getApiReference(): string {
    return renderScalarApiReference();
  }
}
