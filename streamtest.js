var fs = require('fs')
  , bencode = require('./bencode')
  , StreamDecoder = require('./StreamDecoder');

//var path = '/home/masch/Downloads/facebook-themasch.zip';
var path = './benchmark/test.torrent';
var decoder = new StreamDecoder();
var complete = [];
var currP = complete;
var lastKey = false;
var stack = [complete];
var opens = [];
decoder.on('end', function() {
  console.log(complete);
});
decoder.on('data', function(data) {
  //console.log('----DATAEVENT', data.type, data.value ? data.value.toString() : '' );
  var neu;
  switch(data.type) {
    case 'dictionary-start':
      neu = {};
      if(lastKey) {
        currP[lastKey] = neu;
        lastKey = false;
      } else {
        currP.push(neu);
      }
      stack.push(neu);
      opens.push('dict');
      currP = neu;
      break;
    case 'string':
      if(data.isKey) {
        lastKey = data.value;
      } else {
        if(opens[opens.length-1] === 'dict') {
          currP[lastKey] = data.value;
          lastKey = false;
        }
        else if(opens[opens.length-1] === 'list') {
          currP.push(data.value);
        }
        else {
          complete.push(data.value);
        }
      }
      break;
    case 'number':
      if(opens[opens.length-1] === 'dict') {
        currP[lastKey] = data.value;
          lastKey = false;
      }
      else if(opens[opens.length-1] === 'list') {
        currP.push(data.value);
      }
      else {
        complete.push(data.value);
      }
      break;
    case 'list-start':
      neu = [];
      if(lastKey) {
        currP[lastKey] = neu;
        lastKey = false;
      } else {
        currP.push(neu);
      }
      stack.push(neu);
      opens.push('list');
      currP = neu;
      break;
    case 'dictrionary-end':
    case 'list-end':
      opens.pop();
      stack.pop();
      currP = stack[stack.length-1];

  }
});


fs.createReadStream(path).pipe(decoder);
console.log(bencode.decode(fs.readFileSync(path)));