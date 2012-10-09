var Stream = require('stream');
var sys = require('util');

var StreamDecoder = function() {
  Stream.call(this);
  this.writable = true;
  this.buffers = [];
  this.length = 0;
  this.position = 0;
  this.openStructs = [];
};

StreamDecoder.prototype = new Stream();

StreamDecoder.prototype.next = function(start)
{
  //console.log('next', start, this.buffers[0][start]);
  if(this._eagain) {
    return this[this._eagain](start);
  }
  switch(this.buffers[0][start] ) {
    case 0x65: /* e */
      this.closeStruct(start);
      break;
    case 0x64:
      this.dictionary(start);
      break;
    case 0x6C:
      this.list(start);
      break;
    case 0x69:
      this.integer(start);
      break;
    default:
      this.bytes(start);
  }
};

StreamDecoder.prototype.find = function(start, chr)
{
  var i = start;
  var c = this.length;
  var j = 0, o  = 0;
  //console.log('find', start, chr);
  while( i < c ) {
    if((i-o) >= this.buffers[j].length) {
      if(!this.buffers[j+1]) {
        return -1;
      }
      // start at the beginning of the next buffer
      o += (this.buffers[j].length);
      ////console.log(this.buffers[j].length, j, o);
      j++;
      //console.log('dropped buffer');
    }
    //console.log(i, o, (i-o), this.buffers[j][(i-o)]);
    if(this.buffers[j][(i-o)] === chr ) {
      return i;
    }
    i++;
  }
  return -1;
};

StreamDecoder.prototype.closeStruct = function(start)
{
  var s = this.openStructs.pop();
  this.emit('data', {'type': s + '-end'});
  if(this.openStructs[this.openStructs.length-1] === 'dictionary') {
    this._isKey = !this._isKey;
  }
  return this.next(start+1);
};

StreamDecoder.prototype.readUntil = function(start, stop)
{
  //console.log('readUntil', start, stop);
  var len = this.buffers[0].length;
  var data = [];
  while(start != stop) {
    if(start >= len) {
      //console.log('want to drop buffer');
      if(!this.buffers[1]) return -1;
      start = 0;
      stop -= len;
      this.length -= len;
      this.buffers.shift(); // we dont need that data anymore
      len = this.buffers[0].length;
      //console.log('first buffer dropped [' + this.buffers[0].toString() + ' #  ' +  len + ']');
    }
    data.push(this.buffers[0][start]);
    ////console.log('read 1 char');
    //sys.print(".");
    start++;
  }
  this.position = start;
  return new Buffer(data);
};

StreamDecoder.prototype.bytes = function(start)
{
  //console.log('bytes', start);
  if(!this._strlen) {
    // we can skip this part if we already know the strlen
    //console.log('find', start, this.buffers[0].toString()[start]);
    var delim = this.find(start, 0x3A);
    //console.log('delim', delim);
    if(delim === -1) {
      return this._eagain = 'bytes';
    }
    var num = this.readUntil(start, delim);
    if(num === -1) {
      return this._eagain = 'bytes';
    }
    this._strlen = +(num.toString());
    start = this.position;// = delim+1;
  }
  //console.log('bytes-len', this._strlen, this.position);
  if(start + this._strlen > this.length) {
    //console.log('eagain');
    return this._eagain = 'bytes';
  }
  var str = this.readUntil(start+1, start+this._strlen+1);
  //this.position = start+this._strlen;
  this._strlen = 0; // reset this so we recalc it on the next string
  this._eagain = false;
  if(this.openStructs[this.openStructs.length-1] === 'dictionary') {
    this.emit('data', {'type': 'string', 'value': str, 'isKey': this._isKey});
    this._isKey = !this._isKey;
  } else {
    this.emit('data', {'type': 'string', 'value': str});
  }
  return this.next(this.position);
};

StreamDecoder.prototype.integer = function(start)
{
  //console.log('integer', start);
  // we can skip this part if we already know the strlen
  var delim = this.find(start+1, 0x65);
  if(delim === -1) {
    return this._eagain = 'integer';
  }
  var num = this.readUntil(start+1, delim);
  this.position++;// = delim+1;
  if(this.openStructs[this.openStructs.length-1] === 'dictionary') {
    this.emit('data', {'type': 'number', 'value': +(num.toString()), 'isKey': this._isKey});
    this._isKey = !this._isKey;
  } else {
    this.emit('data', {'type': 'number', 'value': +(num.toString())});
  }
  this._eagain = false;
  return this.next(this.position);
};

StreamDecoder.prototype.list = function(start)
{
  this.emit('data', {'type': 'list-start'});
  this.openStructs.push("list");
  this.position++;
  this.next(start+1);
};

StreamDecoder.prototype.dictionary = function(start)
{
  //console.log('dictrionary');
  this.emit('data', {'type': 'dictionary-start'});
  this._isKey = true;
  this.openStructs.push("dictionary");
  this.position++;
  this.next(start+1);
};

var totalSend = 0;

StreamDecoder.prototype.write = function(data)
{
  //console.log('write', new Buffer(data), new Buffer(data)[data.length-1]);
  this.buffers.push(Buffer.isBuffer(data) ? data : new Buffer(data));
  this.length += data.length;
  totalSend += data.length;
  //console.log(this.length, totalSend);
  this.next(this.position);
  //console.log('write_done');
  return true;
};

StreamDecoder.prototype.end = function(data)
{
  ////console.log('end', data);
  if(arguments.length) {
    this.write(data);
  }
  this.emit('end');
};

module.exports = StreamDecoder;