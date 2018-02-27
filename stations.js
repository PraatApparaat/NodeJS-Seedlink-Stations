const Network = require("net");
const Http = require("http");
const CONFIG = require("./config");
const url = require("url");
const querystring = require("querystring");

function validateParameters(queryObject) {

  const ALLOWED_PARAMETERS = [
    "host",
    "port"
  ];

  // Check if all parameters are allowed
  Object.keys(queryObject).forEach(function(x) {

    if(ALLOWED_PARAMETERS.indexOf(x) === -1) {
      throw("Key " + x + " is not supported");
    }

  });


  return true;

}

module.exports = function(callback) {

  // Create a HTTP server
  const Server = Http.createServer(function(request, response) {

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET");

    var uri = url.parse(request.url);

    // Only root path is supported
    if(uri.pathname !== "/") {
      return HTTPError(response, 404, "Method not supported")
    }

    var queryObject = querystring.parse(uri.query);

    // Sanitize user input
    try {
      validateParameters(queryObject);
    } catch(exception) {
      return HTTPError(response, 400, exception);
    }

    var seedlink_host = queryObject['host'] 
    var seedlink_port = queryObject['port']

    // Check if Seedlink to HOST/PORT is present
    SeedlinkChecker(seedlink_host, seedlink_port, response);

  })

  // Listen to incoming HTTP connections
  Server.listen(CONFIG.PORT, CONFIG.HOST, function() {
    if(typeof callback === "function") {
      callback();
    }
  });



}

// Start the NodeJS Seedlink Server
if(require.main === module) {

  // Start up the WFCatalog
  new module.exports(function() {
    console.log("NodeJS Latency Server has been initialized on " + CONFIG.HOST + ":" + CONFIG.PORT)
  });

}

function HTTPError(response, status, message) {

  response.writeHead(status, {"Content-Type": "text/plain"});
  response.end(message)

}

function SeedlinkChecker(SEEDLINK_HOST, SEEDLINK_PORT, response) {

  /* Function SeedlinkChecker
   * Checks if Seedlink is present
   * Returns all metadata: networks, stations, sites
   */

  const INFO = new Buffer("INFO STREAMS\r\n");

  // Open a new TCP socket
  var socket = new Network.Socket()

  // Create a new empty buffer
  var buffer = new Buffer(0);
  var records = new Array();

  // Set Timout in milliseconds
  var timeouttime = 10000
  socket.setTimeout(timeouttime);

  // When the connection is established write INFO
    socket.connect(SEEDLINK_PORT, SEEDLINK_HOST, function() {
      socket.write("CAT\r\n");
    });

  // Data is written over the socket
  socket.on("data", function(data) {

    // Extend the buffer with new data
    buffer = Buffer.concat([buffer, data]);

    /*
	* Take last line of buffer string including 'END' term
	* Use END term to destroy socket
     */
    last_line = buffer.slice(buffer.lastIndexOf("\n"))
    end_term = last_line.slice(last_line.length -3)

    // Final record
    if(end_term.toString() === "END") {

      socket.destroy();

      // Return buffer as json response
      response.end(parseRecords(buffer))
    }



  });

  // Oops
    socket.on("error", function(error) {
	  response.end("0")
    });
  
    socket.on('timeout', () => {
      response.end('socket timeout (after ' + timeouttime + ' ms)');
      socket.end();
    });

}

function parseRecords(buffer) {

  var buffer_to_string = (buffer.toString()).split("\n")

  // Remove 'END' term from record
  buffer_to_string.pop();

  result = buffer_to_string.map(function(x) {
    return {
      "network": x.slice(0, 2).trim(),
	 "station": x.slice(3, 8).trim(),
	 "site": x.slice(9, x.length).trim()
    }

  });

  return JSON.stringify(result);

}
