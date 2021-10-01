import * as functions from 'firebase-functions';
import { spawn } from 'child-process-promise';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RuntimeOptions } from 'firebase-functions';

const ids = [
  {
    background: '#0000FF', 
    color: '#FF0000',
    height: 60,
    width: 400
  },
  {
    background: '#FFFF00', 
    color: '#0000FF',
    height: 70,
    width: 400
  },
  {
    background: '#00FF00', 
    color: '#FFFFFF',
    height: 65,
    width: 400
  }
];

const frames = 300;

function time_to_str(time: number)
{
  const seconds = time % 60;
  var total_minutes = (time - seconds) / 60;
  var minutes = total_minutes % 60;
  var total_hours = (total_minutes - minutes) / 60;
  var hours = total_hours % 24;
  var days = (total_hours - hours) / 24;
  return `${FormatNumberLength(days, 2)} ${FormatNumberLength(hours, 2)} ${FormatNumberLength(minutes, 2)} ${FormatNumberLength(seconds ,2)}`;
}

function FormatNumberLength(num:number, length:number) {
  var r = "" + num;
  while (r.length < length) {
      r = "0" + r;
  }
  return r;
}

function getDifference(a:string, b:string)
{
  for(var i = 0; i<a.length; i++)
    if(a[i] != b[i]) return i;
  return -1;
}

const runtimeOpts:RuntimeOptions = {
  timeoutSeconds: 300,
  memory: '1GB'
}

export const assets = functions
.runWith(runtimeOpts)
.https.onRequest(async (req, res) => {
  // set cors
  res.setHeader("Access-Control-Allow-Origin", "*");

  // get query params
  const kind = req.query.kind;
  const id = req.query.id;
  const ts = req.query.ts;

  if (!['countdown'].includes(kind)) {
    res.status(400).json([{error: 'kind is an invalid option.'}]);
    return
  }
  if (id >= ids.length || id < 0) {
    res.status(400).json([{error: 'invalid id'}]);
    return
  }
  try{
    // get config value based on id
    const tenant_config = ids[id];

    // time format: 1566528379599(ms)  

    // get remaining time
    var remaining = ts - new Date().getTime();
    if (remaining < 0) remaining = 0;

    remaining = Math.round(remaining / 1000);
    var limit = remaining - frames > 0 ? remaining - frames : 0;

    // get max length of string 
    var str_length = time_to_str(remaining).length;
    
    // make different imageValues
    var imageValues:Array<string> = [time_to_str(remaining)];
    const firstImagePath = path.join(os.tmpdir(), `${time_to_str(remaining)}.png`);
    var GIFoptions = ['-delay', '100', firstImagePath];

    for (var i = remaining - 1; i >= limit; i--){
      var diff = getDifference(time_to_str(i), time_to_str(i+1));
      var value = `${time_to_str(i).substring(diff, str_length)}`;
      if(!imageValues.includes(value))imageValues.push(value);
      GIFoptions.push(path.join(os.tmpdir(), `${value}.png`));
    }

    // make PNG files from different imageValues
    var PNGoptions = [];
    for(var i = 0; i < imageValues.length; i++){
      var value = imageValues[i];
      // spawn imagemagick command 
      const tempPNGLocalFile = path.join(os.tmpdir(), `${value}.png`);
      if ((value.length == 2 || value.length == 5) && value.charAt(0) == '1') {
        value = "\\ " + value; 
        console.log(value);
      }
      PNGoptions = [
        '-background', 'transparent',
        '-fill', tenant_config['color'], 
        '-undercolor', tenant_config['background'],
        '-size', `${tenant_config['width']}x${tenant_config['height']}`,
        '-gravity', 'east',
        `label:${value}`, 
        tempPNGLocalFile
      ];
      console.log(PNGoptions);
      await spawn('convert', PNGoptions, {capture: ['stdout', 'stderr']});
    }
    
    // make GIF file
    // spawn imagemagick command 
    const tempGIFLocalFile = path.join(os.tmpdir(), `output.gif`);
    GIFoptions = GIFoptions.concat(['-loop', '1', tempGIFLocalFile]);
    console.log(GIFoptions);
    await spawn('convert', GIFoptions, {capture: ['stdout', 'stderr']});
    var data = fs.readFileSync(tempGIFLocalFile);

    // remove temp files
    for(var i = 0; i < imageValues.length; i++){
      const tempPNGLocalFile = path.join(os.tmpdir(), `${imageValues[i]}.png`);
      fs.unlinkSync(tempPNGLocalFile);
    }
    fs.unlinkSync(tempGIFLocalFile);

    res.contentType('image/gif');
    res.end(data, 'binary');
  }
  catch (e){
    console.log(e);
    res.status(500).send('');
  }
});
