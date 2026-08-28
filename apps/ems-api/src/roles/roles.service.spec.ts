import { Controller, Delete, Get, Post } from "@nestjs/common";
import { MetadataScanner, Reflector } from "@nestjs/core";
import { Roles } from "@/auth/decorators/roles.decorator";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";
import { RolesService } from "./roles.service";

/*
 * Real decorators on real controllers, read through a real Reflector.
 *
 * The unit tests beside this one cover the arithmetic; what they cannot cover
 * is whether the metadata is actually being found. That failure mode is the
 * dangerous one here: it compiles, it returns an empty list, and a
 * permissions screen showing nothing looks like a school with no routes
 * rather than a reader that is broken.
 */

@Controller("open-area")
class OpenController {
  @Get("thing")
  thing() {}
}

@Controller("guarded-area")
@Roles("SCHOOL_ADMIN")
@RequiresModule("GRADING")
class ClassGuardedController {
  @Get("list")
  list() {}

  // Overrides the controller's roles.
  @Post("submit")
  @Roles("SCHOOL_ADMIN", "TEACHER", "STUDENT")
  submit() {}

  @Delete(":id")
  remove() {}
}

function serviceFor(...controllers: object[]): RolesService {
  const discovery = {
    getControllers: () =>
      controllers.map((Ctor) => ({
        instance: Object.create((Ctor as { prototype: object }).prototype),
        metatype: Ctor,
      })),
  };
  return new RolesService(
    discovery as never,
    new MetadataScanner(),
    new Reflector(),
  );
}

describe("RolesService.capabilities", () => {
  // The failure that would be silent.
  it("actually finds the routes", () => {
    const result = serviceFor(OpenController, ClassGuardedController).capabilities();
    expect(result.totalRoutes).toBe(4);
  });

  it("reports a route with no @Roles as open, not as missing", () => {
    const result = serviceFor(OpenController).capabilities();
    const route = result.areas[0]?.routes[0];
    expect(route?.roles).toBeNull();
    expect(result.openRoutes).toBe(1);
    expect(result.counts.GUARDIAN).toBe(1);
  });

  // The mistake this screen exists to prevent, made by the screen itself.
  it("applies a controller-level @Roles to its methods", () => {
    // Reading only the handler would report every route on a class-guarded
    // controller as open to everybody — which is exactly the reassurance an
    // administrator must never be given falsely.
    const result = serviceFor(ClassGuardedController).capabilities();
    const list = result.areas[0]?.routes.find((r) => r.path.endsWith("list"));
    expect(list?.roles).toEqual(["SCHOOL_ADMIN"]);
    expect(result.openRoutes).toBe(0);
    expect(result.counts.STUDENT).toBe(1); // only the overriding route
  });

  it("lets a method-level @Roles override the controller's", () => {
    const result = serviceFor(ClassGuardedController).capabilities();
    const submit = result.areas[0]?.routes.find((r) => r.path.endsWith("submit"));
    expect(submit?.roles).toEqual(["SCHOOL_ADMIN", "TEACHER", "STUDENT"]);
  });

  it("carries the module down from the controller", () => {
    const result = serviceFor(ClassGuardedController).capabilities();
    expect(result.areas[0]?.modules).toEqual(["GRADING"]);
  });

  it("builds the full path and the verb", () => {
    const result = serviceFor(ClassGuardedController).capabilities();
    const paths = result.areas[0]?.routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain("GET guarded-area/list");
    expect(paths).toContain("POST guarded-area/submit");
    expect(paths).toContain("DELETE guarded-area/:id");
  });

  it("groups the two controllers into two areas", () => {
    const result = serviceFor(OpenController, ClassGuardedController).capabilities();
    expect(result.areas.map((a) => a.area)).toEqual(["guarded-area", "open-area"]);
  });

  it("copes with an application that has no controllers", () => {
    const result = serviceFor().capabilities();
    expect(result).toMatchObject({ totalRoutes: 0, openRoutes: 0, areas: [] });
  });
});
