#ifdef GL_ES
precision highp float;
#endif

#pragma glslify: octMapUVToDir = require(./OctMapUVToDir)
#pragma glslify: envMapOctahedral = require(./EnvMapOctahedral)
#pragma glslify: encodeRGBM = require(../local_modules/glsl-rgbm/encode)
#pragma glslify: decodeRGBM = require(../local_modules/glsl-rgbm/decode)

varying vec2 vTexCoord;
uniform sampler2D uSource;
uniform samplerCube uCubemap;
uniform float uSourceSize;
uniform float uTextureSize;
uniform bool uRGBM;

vec2 signed(vec2 v) {
  return step(0.0, v) * 2.0 - 1.0;
}

const float PI = 3.1415926;

void main() {
  // vec3 N = octMapUVToDir((vTexCoord * uTextureSize - 0.5) / (uTextureSize + 1.0), uTextureSize);
  vec3 N = octMapUVToDir(vTexCoord, uTextureSize);
  vec3 normal = N;

  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(up, normal));
  up = cross(normal,right);

  vec3 sampledColor = vec3(0,0,0);
  float index = 0.0;
  const float dphi = 2.0 * PI / 180.0 * 2.0;
  const float dtheta = 0.5 * PI / 64.0 * 2.0;
  for(float phi = 0.0; phi < 2.0 * PI; phi += dphi) {
    for(float theta = 0.0; theta < 0.5 * PI; theta += dtheta) {
      vec3 temp = cos(phi) * right + sin(phi) * up;
      vec3 sampleVector = cos(theta) * normal + sin(theta) * temp;
      // in theory this should be sample from mipmap level e.g. 2.0, 0.0
      // but sampling from prefiltered roughness gives much smoother results
      vec2 sampleUV = envMapOctahedral(sampleVector, 0.0, 2.0);
      if (uRGBM) {
        sampledColor += decodeRGBM(texture2D( uSource, sampleUV)) * cos(theta) * sin(theta);
      } else {
        sampledColor += texture2D( uSource, sampleUV).rgb * cos(theta) * sin(theta);
      }
      index++;
    }
  }

  sampledColor = PI * sampledColor / index;

  if (uRGBM) {
    gl_FragColor = encodeRGBM(sampledColor);
  } else {
    gl_FragColor.rgb = sampledColor;
    gl_FragColor.a = 1.0;
  }
}
