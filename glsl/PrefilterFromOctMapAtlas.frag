#ifdef GL_ES
precision highp float;
#endif

#pragma glslify: envMapOctahedral = require(./EnvMapOctahedral)
#pragma glslify: octMapUVToDir = require(./OctMapUVToDir)
#pragma glslify: encodeRGBM = require(../local_modules/glsl-rgbm/encode)
#pragma glslify: decodeRGBM = require(../local_modules/glsl-rgbm/decode)
#pragma glslify: random = require(glsl-random/lowp)

varying vec2 vTexCoord;
uniform float uTextureSize;
uniform sampler2D uSource;
uniform sampler2D uHammersleyPointSetMap;
uniform int uNumSamples;
uniform float uLevel;
uniform float uSourceMipmapLevel;
uniform float uSourceRoughnessLevel;
uniform float uRoughnessLevel;

//if < 0 return -1, otherwise 1
vec2 signed(vec2 v) {
  return step(0.0, v) * 2.0 - 1.0;
}

const float PI = 3.1415926536;

float saturate(float f) {
  return clamp(f, 0.0, 1.0);
}

vec3 saturate(vec3 v) {
  return clamp(v, vec3(0.0), vec3(1.0));
}

//Sampled from a texture generated by code based on
//http://holger.dammertz.org/stuff/notes_HammersleyOnHemisphere.html
vec2 Hammersley(int i, int N) {
  return texture2D(uHammersleyPointSetMap, vec2(0.5, (float(i) + 0.5)/float(N))).rg;
}

//Based on Real Shading in Unreal Engine 4
vec3 ImportanceSampleGGX(vec2 Xi, float Roughness, vec3 N) {
  //this is mapping 2d point to a hemisphere but additionally we add spread by roughness
  float a = Roughness * Roughness;
  a *= 0.5; // to prevent overblurring as we sample from previous roughness level with smaller number of samples
  float Phi = 2.0 * PI * Xi.x + random(N.xz) * 0.5;
  float CosTheta = sqrt((1.0 - Xi.y) / (1.0 + (a*a - 1.0) * Xi.y));
  float SinTheta = sqrt(1.0 - CosTheta * CosTheta);
  vec3 H;
  H.x = SinTheta * cos(Phi);
  H.y = SinTheta * sin(Phi);
  H.z = CosTheta;

  //Tangent space vectors
  vec3 UpVector = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 TangentX = normalize(cross(UpVector, N));
  vec3 TangentY = normalize(cross(N, TangentX));

  //Tangent to World Space
  return TangentX * H.x + TangentY * H.y + N * H.z;

  //
  //vec3 n = N;
  //float aa = 1.0 / (1.0 + n.z);
  //float b = -n.x * n.y * aa;
  //vec3 b1 = vec3(1.0 - n.x * n.x * aa, b, -n.x);
  //vec3 b2 = vec3(b, 1.0 - n.y * n.y * aa, -n.y);
  //mat3 vecSpace = mat3(b1, b2, n);
  //return normalize(mix(vecSpace * H, N, 1.0 - Roughness));
}

//TODO: optimize this using sign()
//Source: http://webglinsights.github.io/downloads/WebGL-Insights-Chapter-16.pdf

vec4 textureOctMapLod(sampler2D tex, vec2 uv) {
  float width = 2048.0;
  float maxLevel = 11.0; // this should come from log of size
  float levelSizeInPixels = pow(2.0, 1.0 + uSourceMipmapLevel + uSourceRoughnessLevel);
  float levelSize = max(64.0, width / levelSizeInPixels);
  float roughnessLevelWidth = width / pow(2.0, 1.0 + uSourceRoughnessLevel);
  float vOffset = (width - pow(2.0, maxLevel - uSourceRoughnessLevel));
  float hOffset = 2.0 * roughnessLevelWidth - pow(2.0, log2(2.0 * roughnessLevelWidth) - uSourceMipmapLevel);
  // trying to fix oveflow from atlas..
  uv = (uv * levelSize + 0.5) / (levelSize + 1.0); 
  uv *= levelSize;
  uv = (uv + vec2(hOffset, vOffset)) / width;
  return texture2D(uSource, uv);
}

vec3 PrefilterEnvMap( float Roughness, vec3 R ) {
  vec3 N = R;
  vec3 V = R;
  vec3 PrefilteredColor = vec3(0.0);
  const int NumSamples = 512;
  float TotalWeight = 0.0;
  for( int i = 0; i < NumSamples; i++ ) {
    if (i > uNumSamples) {
      break;
    }
    vec2 Xi = Hammersley( i, uNumSamples );
    vec3 H = ImportanceSampleGGX( Xi, Roughness, N );
    vec3 L = 2.0 * dot( V, H ) * H - V;
    float NoL = saturate( dot( N, L ) );
    if( NoL > 0.0 ) {
      PrefilteredColor += decodeRGBM(textureOctMapLod( uSource, envMapOctahedral(L))) * NoL;
      TotalWeight += NoL;
    }
  }
  return PrefilteredColor / TotalWeight;
}

void main() {
  vec3 normal = octMapUVToDir(vTexCoord);
  gl_FragColor = encodeRGBM(PrefilterEnvMap(uRoughnessLevel / 5.0, normal));
}
