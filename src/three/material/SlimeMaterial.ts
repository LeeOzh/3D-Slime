import * as THREE from "three";
import {
  SLIME_BEGIN_NORMAL,
  SLIME_BEGIN_VERTEX,
  SLIME_DEFORM_PARS,
  SLIME_NORMAL_FN,
} from "../deformation/DeformationShader";
import { createSlimeUniforms, type SlimeUniforms } from "../deformation/DeformationUniforms";

/**
 * MeshPhysicalMaterial with GPU soft-body deformation.
 * Transmission / clearcoat / sheen stay on the material as authored.
 */
export class SlimeMaterial {
  readonly material: THREE.MeshPhysicalMaterial;
  readonly uniforms: SlimeUniforms;
  private compiled = false;

  constructor(base: THREE.MeshPhysicalMaterial) {
    this.material = base;
    this.uniforms = createSlimeUniforms();
    const uniforms = this.uniforms;

    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\n${SLIME_DEFORM_PARS}\n${SLIME_NORMAL_FN}\n`,
        )
        .replace("#include <beginnormal_vertex>", SLIME_BEGIN_NORMAL)
        .replace("#include <begin_vertex>", SLIME_BEGIN_VERTEX);

      this.compiled = true;
    };

    this.material.customProgramCacheKey = () => "slime-softbody-v1";
    this.material.needsUpdate = true;
  }

  get isCompiled(): boolean {
    return this.compiled;
  }
}

/** Enable GPU deform on an existing physical material. */
export function attachSlimeDeform(material: THREE.MeshPhysicalMaterial): SlimeMaterial {
  return new SlimeMaterial(material);
}
