/**
 * GLSL soft-body deformation for MeshPhysicalMaterial (onBeforeCompile).
 * Mirrors DeformationSystem.deformVertex (CPU) so look stays consistent.
 */

export const SLIME_DEFORM_PARS = /* glsl */ `
uniform float uTime;
uniform float uSquash;
uniform float uSxz;
uniform float uSy;
uniform float uWobble;
uniform float uIdleAmp;
uniform float uHappyBounce;
uniform float uBounce;
uniform vec3 uPressPoint;
uniform float uPress;
uniform float uDentDepth;
uniform float uDentRadius;
uniform vec3 uStretch;
uniform float uStretchAmount;
uniform vec3 uStretchLegacy;
uniform float uStretchLegacyLen;
uniform float uDragging;
uniform vec3 uScale;
uniform float uSideComp;
uniform float uReleaseEnergy;
uniform float uPetStrength;
uniform float uPetWave;
uniform vec3 uPetCenter;
uniform vec2 uEarLag;
uniform vec2 uHeadLag;
uniform vec2 uEarStretch;
uniform float uEarGrabSide;
uniform float uLockEar;
uniform float uLockSide;
/** 0 none, 1 left, 2 right, 3 top, 4 belly */
uniform float uLockRegion;
uniform vec2 uLean;
uniform float uSleepy;
uniform float uReduceMotion;
uniform float uWantNoise;
uniform float uMaxFieldP;
uniform vec4 uPressure[7];

float slimeSstep(float e0, float e1, float x) {
  float t = clamp((x - e0) / ((e1 - e0) + sign(e1 - e0) * 1e-6), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float slimeNoise(vec3 p, float t) {
  return sin(p.x * 2.7 + t * 1.3) * cos(p.y * 3.1 - t * 0.9) * sin(p.z * 2.4 + t * 0.7);
}

float slimeClamp(float v, float a, float b) {
  return clamp(v, a, b);
}

vec3 slimeDeform(vec3 rp) {
  float rl = max(length(rp), 1e-5);
  vec3 n = rp / rl;
  vec3 p = rp;

  if (uReduceMotion < 0.5) {
    if (uWantNoise > 0.5) {
      float breath = 1.0 + sin(uTime * 1.6 + p.y * 1.8) * uIdleAmp;
      float ripple = slimeNoise(n * 1.6, uTime * 0.7) * (0.01 + uWobble * 0.7);
      p = p * breath + n * ripple * 1.1;
    } else if (uIdleAmp > 0.0) {
      float breath = 1.0 + sin(uTime * 1.6 + p.y * 1.8) * uIdleAmp;
      p *= breath;
    }
  }

  p.x *= uScale.x * uSxz;
  p.y *= uScale.y * uSy;
  p.z *= uScale.z * uSxz;
  p.y += uHappyBounce * 0.12 * uBounce * (0.55 + n.y * 0.45);

  // Pressure field
  for (int i = 0; i < 7; i++) {
    float pr = uPressure[i].w;
    if (pr < 0.02) continue;
    vec3 dir = uPressure[i].xyz;
    float dist = length(n - dir);
    if (dist < uDentRadius) {
      float infl = slimeSstep(uDentRadius, 0.0, dist) * pr * uDentDepth * 0.9;
      p -= n * infl;
    }
    float mid = uDentRadius * 1.25;
    float band = 1.0 - slimeSstep(0.0, uDentRadius * 0.55, abs(dist - mid));
    if (dist < uDentRadius * 1.7 && band > 0.0) {
      p += n * (band * pr * 0.09);
    }
  }

  if (uPress > 0.01) {
    float dist = length(n - uPressPoint);
    if (uMaxFieldP < 0.02) {
      if (dist < uDentRadius) {
        float infl = slimeSstep(uDentRadius, 0.0, dist) * uPress * uDentDepth;
        p -= n * infl;
      }
      float mid = uDentRadius * 1.3;
      float band = 1.0 - slimeSstep(0.0, uDentRadius * 0.55, abs(dist - mid));
      if (dist < uDentRadius * 1.8 && band > 0.0) {
        p += n * (band * uPress * 0.08);
      }
    } else if (dist < uDentRadius) {
      float infl = slimeSstep(uDentRadius, 0.0, dist) * uPress * uDentDepth * 0.35;
      p -= n * infl;
    }
  }

  // Soft stretch smear (match CPU lock: left / right / top / belly)
  if (uStretchAmount > 0.01) {
    float influence = 0.55 + n.y * 0.35;
    if (uLockRegion > 0.5 && uLockRegion < 1.5) {
      influence *= slimeClamp(0.55 - n.x * 0.9, 0.15, 1.2);
    } else if (uLockRegion > 1.5 && uLockRegion < 2.5) {
      influence *= slimeClamp(0.55 + n.x * 0.9, 0.15, 1.2);
    } else if (uLockRegion > 2.5 && uLockRegion < 3.5) {
      influence *= slimeSstep(-0.2, 0.9, n.y);
    } else if (uLockRegion > 3.5) {
      influence *= slimeSstep(0.3, -0.7, n.y);
    }
    p.x += uStretch.x * influence * 0.85;
    p.y += uStretch.y * influence * 0.85;
    if (uLockRegion > 0.5 && uLockRegion < 1.5) p.x += uStretch.x * 0.12 * slimeClamp(n.x, 0.0, 1.0);
    if (uLockRegion > 1.5 && uLockRegion < 2.5) p.x += uStretch.x * 0.12 * slimeClamp(-n.x, 0.0, 1.0);
  }

  if (uDragging > 0.5 && uStretchLegacyLen > 0.002 && uStretchAmount < 0.05 && uPress > 0.01) {
    float dist = length(n - uPressPoint);
    float rub = slimeSstep(uDentRadius, 0.0, dist) * uPress * 0.35;
    p.x += uStretchLegacy.x * rub;
    p.y += uStretchLegacy.y * rub;
  }

  if (abs(uSideComp) > 0.002) {
    float face = max(0.0, n.z) * (1.0 - abs(n.y) * 0.5);
    p.x += uSideComp * 0.06 * face * n.x;
    p.z += uSideComp * 0.02 * face * abs(n.x);
  }

  if (uReleaseEnergy > 0.02) {
    float pulse = uReleaseEnergy * 0.045 * (0.4 + abs(n.y) * 0.3 + abs(n.x) * 0.2);
    p += n * pulse;
  }

  if (uPetStrength > 0.02 && uPetWave > 0.01) {
    float dist = length(n - uPetCenter);
    float ringR = 0.15 + uPetWave * 0.85;
    float band = 1.0 - slimeSstep(0.0, 0.28, abs(dist - ringR));
    if (band > 0.0) {
      p += n * (band * uPetStrength * 0.05);
    }
  }

  if (uReduceMotion < 0.5 && (abs(uEarLag.x) > 0.001 || abs(uEarLag.y) > 0.001)) {
    float earW = slimeSstep(0.25, 0.85, n.y) * (0.3 + abs(n.x));
    p.x += uEarLag.x * 0.09 * earW;
    p.y += uEarLag.y * 0.05 * earW;
  }

  if (abs(uEarStretch.x) > 0.005 || abs(uEarStretch.y) > 0.005) {
    float side = uLockEar != 0.0 ? uLockEar : uEarGrabSide;
    if (side != 0.0) {
      float sideMask = side < 0.0 ? slimeClamp(-n.x, 0.0, 1.0) : slimeClamp(n.x, 0.0, 1.0);
      float earW = slimeSstep(0.15, 0.92, n.y) * sideMask;
      p.x += uEarStretch.x * 0.95 * earW;
      p.y += uEarStretch.y * 0.7 * earW;
      float tip = earW * earW;
      p.x += uEarStretch.x * 0.25 * tip;
      p.y += uEarStretch.y * 0.2 * tip;
      float other = side < 0.0 ? slimeClamp(n.x, 0.0, 1.0) : slimeClamp(-n.x, 0.0, 1.0);
      float otherW = slimeSstep(0.2, 0.9, n.y) * other;
      p.x += uEarStretch.x * 0.08 * otherW;
    }
  } else if (uStretchAmount > 0.05 && abs(uLockEar) > 0.5) {
    float earW = slimeSstep(0.2, 0.9, n.y) * (uLockEar < 0.0 ? slimeClamp(-n.x, 0.0, 1.0) : slimeClamp(n.x, 0.0, 1.0));
    p.x += uStretch.x * 0.7 * earW;
    p.y += uStretch.y * 0.45 * earW;
  }

  if (uReduceMotion < 0.5 && (abs(uHeadLag.x) > 0.001 || abs(uHeadLag.y) > 0.001)) {
    float headW = slimeSstep(0.3, 0.95, n.y);
    p.x += uHeadLag.x * 0.06 * headW;
    p.y += uHeadLag.y * 0.05 * headW;
  }

  if (uStretchLegacyLen > 0.001 && uStretchAmount < 0.05) {
    float influence = 0.55 + n.y * 0.35;
    p.x += uStretchLegacy.x * influence;
    p.y += uStretchLegacy.y * influence;
    p.z += uStretchLegacy.z * influence;
    p.y -= uStretchLegacy.y * 0.15 * (1.0 - n.y);
  }

  p.x += uLean.x * (0.35 + n.y * 0.2);
  p.y += uLean.y * 0.35;

  if (uSleepy > 0.5) {
    float headW = slimeSstep(0.1, 0.9, n.y);
    p.y -= 0.06 * headW;
    p.x *= 1.0 - 0.02 * headW;
  }

  return p;
}
`;

export const SLIME_BEGIN_NORMAL = /* glsl */ `
vec3 objectNormal = slimeDeformedNormal( position, normal );
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

export const SLIME_BEGIN_VERTEX = /* glsl */ `
vec3 transformed = slimeDeform( position );
`;

/**
 * Finite-difference normal from slimeDeform, blended with rest mesh normals
 * so ear bumps / silhouette match CPU computeVertexNormals more closely.
 */
export const SLIME_NORMAL_FN = /* glsl */ `
vec3 slimeDeformedNormal( vec3 rp, vec3 restN ) {
  vec3 n = normalize( rp );
  vec3 rn = normalize( restN );

  float deformAmt =
    uPress +
    uStretchAmount +
    uMaxFieldP +
    uReleaseEnergy +
    uPetStrength +
    abs( uSideComp ) +
    abs( uEarStretch.x ) + abs( uEarStretch.y ) +
    abs( uEarLag.x ) + abs( uEarLag.y ) +
    abs( uHeadLag.x ) + abs( uHeadLag.y ) +
    abs( uWobble ) * 0.5;

  // Idle / tiny deform: keep mesh rest normals (cat ears, nezha bumps).
  if ( deformAmt < 0.015 ) {
    return rn;
  }

  float rl = max( length( rp ), 1e-5 );
  vec3 up = abs( n.y ) < 0.95 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
  vec3 t = normalize( cross( up, n ) );
  vec3 b = normalize( cross( n, t ) );
  // Scale-aware epsilon — large enough for stability, small enough for dent falloff.
  float eps = 0.018 * max( rl, 0.35 );
  vec3 p0 = slimeDeform( rp );
  vec3 p1 = slimeDeform( rp + t * eps );
  vec3 p2 = slimeDeform( rp + b * eps );
  vec3 nr = cross( p1 - p0, p2 - p0 );
  float len = length( nr );
  if ( len < 1e-10 ) {
    return rn;
  }
  nr /= len;
  if ( dot( nr, n ) < 0.0 ) nr = -nr;

  // Blend toward rest mesh normal so non-spherical bumps stay consistent.
  float k = clamp( deformAmt * 2.5, 0.35, 0.85 );
  return normalize( mix( rn, nr, k ) );
}
`;
