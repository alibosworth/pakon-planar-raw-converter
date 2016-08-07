#!/usr/bin/env node

var fs = require( 'fs' );
var path = require( 'path' );
var process = require( "process" );
var glob = require('glob-fs')({ gitignore: true });
var execSync = require('child_process').execSync;
var promiseExec = require('child-process-promise').exec

var currentDir = process.cwd();

var commandExists = require('command-exists');

var BYTE_SIZE_TO_DIMENSIONS = {
  "36000000": "3000x2000",     // "Base 16"
  "36000016": "3000x2000+16",  // "Base 16" exported with header
  "20250000": "2250x1500",     // "Base 8"
  "20250016": "2250x1500+16",  // "Base 8" exported with header
  "9000000" : "1500x1000",      // "Base 4"
  "9000016" : "1500x1000+16"   // "Base 4" exported with header
}

var data = {};

checkDependencies();

var rawFiles = glob.readdirSync('*.raw', {});


if (!rawFiles.length) {
  exit("No raw files found in the current directory");
} else {
  console.log(`Found ${rawFiles.length} raw files in current directory...`);
}

rawFiles.forEach(function(rawFile){
  var filePath = currentDir + "/" + rawFile;
  var sizeInBytes = fs.statSync(filePath).size;
  var dimensionsForConvert = BYTE_SIZE_TO_DIMENSIONS[sizeInBytes.toString()];

  if (!dimensionsForConvert) {
    console.error(`${rawFile} is the wrong size - please export via TLXClientDemo in "Planar" mode at "Original height and width"`);
  } else {
    data[rawFile] = {
      size: dimensionsForConvert
    }
  }
});

if (Object.keys(data).length === 0) {
  exit("Sorry, no .raw files in the current directory look right")
}

console.log (`${Object.keys(data).length} raw files are the correct size, converting them...`)

convertRawFilesToTif(data).then(function(tifs){
  invertAndBalanceTifs(tifs);

})

 // convert -size 2250x1500 -depth 16  rgb:1.raw tif:out.tif
// console.log("data",data);

// fs.readdir( __dirname, function( err, files ) {
//   if( err ) {
//       console.error( "Could not list the directory.", err );
//       process.exit( 1 );
//   }

//   files.forEach( function( file, index ) {
//     console.log(file)
//   });
// });

function convertRawFilesToTif (data) {
  var conversionPromises = []
  for (var item in data) {
     // convert -size 2250x1500 -depth 16 rgb:1.raw tif:out.tif
     var promise = convertRawToTif(item, data[item].size);
     conversionPromises.push(promise);
     promise.catch(function(error) {
      exit("Error converting a file from a raw to a tiff", item);
     })
     // console.log(data[item].size);
  }

  return Promise.all(conversionPromises).then(values => {
    console.log(`All ${values.length} raw images converted to tif, adjusting with negfix8`)
    return values;
  });

}

function convertRawToTif (name, sizeParameter) {
  var baseName = path.basename(name, ".raw");
  // console.log("basename", baseName);
  var cmd = `convert -size ${sizeParameter} -depth 16 -interlace plane rgb:${name} -gamma 2.2 tif:${baseName}.tif`
  return promiseExec(cmd).then(function(){
    return `${baseName}.tif`;
  })
    // command output is in stdout
    // console.log(error, stdout, stderr);
  // });
  // console.log(cmd);
}

// console.log("convertedFiles outer", convertedFiles);

function invertAndBalanceTifs(tifs) {
  var dir = "out"
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }
  // console.log("invertAndBalanceTifs" ,tifs);
  tifs.forEach(function(tif){
  var cmd = `negfix8 -cs ${tif} out/${tif}`
    console.log(cmd);
    return promiseExec(cmd).then(function(){
      return tif;
    }).catch(function(error){
      console.log(`Error converting ${tif} to out/${tif}`);
    });
  });
}

function checkDependencies () {
  console.log ("checkDependencies");
  commandExists('negfix8', function(err, commandExists) {

    if(commandExists) {
        console.log("y")
    }
    if (err) {
      console.log("err",err);
    }

  });

}
function exit (message) {
  console.error(message);
  process.exit(1);
}

