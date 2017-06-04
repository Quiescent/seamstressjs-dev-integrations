require('mocha-testcheck').install();
const assert = require('chai').assert;
const R = require('ramda');
const adapters = require('seamstressjs-adapters');
const seamstress = require('seamstressjs-core');
const sampleOne = require('testcheck').sampleOne;
const Jimp = require('jimp');
const fs = require('fs');

function averageImageEnergy(image) {
  const energyMap = image.energyMap();
  return R.compose((x) => x / (image.width() * image.height()),
                   R.sum, R.map(R.compose(R.sum, R.filter(isFinite))))
  (energyMap);
}

const NUMBER_OF_TESTS = 1;

// TODO: there's a problem with the correctness of sampling from the
// generator inside of the custom generator.
function rgbArray(size) {
  const rgbPixelGen = gen.object({
    r: gen.numberWithin(0, 255),
    g: gen.numberWithin(0, 255),
    b: gen.numberWithin(0, 255)
  });

  return gen.array(rgbPixelGen, { size: size });
}

const MINIMUM_DIMENSION = 3;

function pixelMatrix(xRank, yRank) {
  const maxYDimension = sampleOne(gen.sPosInt, yRank - MINIMUM_DIMENSION) + MINIMUM_DIMENSION;
  return gen.array(rgbArray(maxYDimension), { maxSize: xRank, minSize: MINIMUM_DIMENSION });
}

const seedBank = require('./seedBank.json');

function saveWhen(p, seedId, seed, seedBank) {
  if (p) {
    seedBank[seedId] = seedBank[seedId] || [];
    if (seedBank[seedId].indexOf(seed) < 0) {
      seedBank[seedId].push(seed);
      console.error('Seed added to bank:', seed);
    }

    fs.writeFileSync('./test/seedBank.json', JSON.stringify(seedBank));
  }
}

function createDataURIImage(pixelMatrix, callback) {
  const jimpImage = new Jimp(pixelMatrix.length, pixelMatrix[0].length);
  for (var l = 0; l != pixelMatrix.length; ++l) {
    for (var L = 0; L != pixelMatrix[0].length; ++L) {
      const pixel = pixelMatrix[l][L];

      // Fixme, don't want to hardcode alpha
      const hex = Jimp.rgbaToInt(pixel.r, pixel.g, pixel.b, 255);
      jimpImage.setPixelColor(hex, l, L);
    }
  }

  jimpImage.getBase64('image/png', callback);
}

describe('When removing a low energy seam', function () {
  const seedId = 'averageImageEnergyIncreasing';
  const seeds = seedBank[seedId] || [];
  seeds.push(sampleOne(gen.sPosInt, Math.pow(2, 32) - 1));

  const matrix = sampleOne(pixelMatrix(5, 5));

  seeds.forEach(function (seed) {
    describe('the average energy of the image should increase', function () {
      check.it(
        'for seed: ' + seed,
        { numTests: NUMBER_OF_TESTS,
          seed: seed },
        pixelMatrix(5, 5), (pixelMatrix) => {
          createDataURIImage(pixelMatrix, function (error, dataURIImage) {
            const width = pixelMatrix.length;
            const height = pixelMatrix[0].length;
            const carvedVertically = seamstress.resize(dataURIImage, {
              width: width - 1,
              height: height });

            const originalEnergy = averageImageEnergy(dataURIImage);
            const verticalEnergy = averageImageEnergy(carvedVertically);
            saveWhen(function () { return verticalEnergy >= originalEnergy; },

                     seedId, seed, seedBank);
            console.log(JSON.stringify(pixelMatrix));
            assert.isAtMost(originalEnergy, verticalEnergy,
                            'energy decreased');

            const carvedHorizontally = seamstress.resize(dataURIImage, {
              width: width,
              height: height - 1 });

            const horizontalEnergy = averageImageEnergy(carvedHorizontally);
            saveWhen(function () { return horizontalEnergy >= originalEnergy; },

                     seedId, seed, seedBank);
            assert.isAtMost(originalEnergy, horizontalEnergy,
                            'energy decreased');
          });
        });
    });
  });
});

describe('Conversely, when growing the image from a low energy seam,', function () {
  const seedId = 'averageImageEnergyDecreasing';
  const seeds = seedBank[seedId] || [];
  seeds.push(sampleOne(gen.sPosInt, Math.pow(2, 32) - 1));

  const matrix = sampleOne(pixelMatrix(5, 5));

  seeds.forEach(function (seed) {
    describe('the average energy of the image should decrease', function () {
      check.it(
        'for seed: ' + seed,
        { numTests: NUMBER_OF_TESTS,
          seed: seed },
        pixelMatrix(5, 5), (pixelMatrix) => {
          createDataURIImage(pixelMatrix, function (error, dataURIImage) {
            const width = pixelMatrix.length;
            const height = pixelMatrix[0].length;
            const carvedVertically = seamstress.resize(dataURIImage, {
              width: width - 1,
              height: height });

            const verticalEnergy = averageImageEnergy(carvedVertically);
            const originalEnergy = averageImageEnergy(dataURIImage);
            saveWhen(function () { return verticalEnergy <= originalEnergy; },

                     seedId, seed, seedBank);
            assert.isAtLeast(originalEnergy, verticalEnergy,
                             'energy decreased');

            const carvedHorizontally = seamstress.resize(dataURIImage, {
              width: width,
              height: height - 1 });

            const horizontalEnergy = averageImageEnergy(carvedHorizontally);
            saveWhen(function () { return horizontalEnergy <= originalEnergy; },

                     seedId, seed, seedBank);
            assert.isAtLeast(originalEnergy, horizontalEnergy,
                             'energy decreased');
          });
        });
    });
  });
});
