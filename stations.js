const Network = require("net");
const Http = require("http");
const CONFIG = require("./config");
const url = require("url");
const querystring = require("querystring");

// Global container for Stations
var GLOBAL_STATIONS = new Object()

function validateParameters(queryObject) {

  const ALLOWED_PARAMETERS = [
    "hostport",
  ];

  // Check if all parameters are allowed
  Object.keys(queryObject).forEach(function(x) {

    if(ALLOWED_PARAMETERS.indexOf(x) === -1) {
      throw("Key " + x + " is not supported");
    }

  });

  return true;

}

var payload = new Object();

module.exports = function(callback) {

  // Create a HTTP server
  const Server = Http.createServer(function(request, response) {

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET");

    var uri = url.parse(request.url);
    var queryObject = querystring.parse(uri.query);

    if (uri.query == null) {
      return HTTPError(response, 400, "Define path");
    } else if (uri.query.length == 0) {
      return HTTPError(response, 400, "Empty query string");
    }

    // Only root path is supported
    if(uri.pathname !== "/") {
      return HTTPError(response, 405, "Method not supported")
    }

    // Sanitize user input
    try {
      validateParameters(queryObject);
    } catch(exception) {
	 console.log(exception)
      return HTTPError(response, 400, exception);
    }

    payload = filterSeedlinkMetadata(queryObject);

    response.end(JSON.stringify(payload));

  })


  // Refresh payload object over timeinterval
  setInterval(SeedlinkChecker, CONFIG.REFRESH_INTERVAL);

  // Listen to incoming HTTP connections
  Server.listen(CONFIG.PORT, CONFIG.HOST, function() {
    if(typeof callback === "function") {
      callback();
    }
  });

  // Get initial Seedlink metadata
  SeedlinkChecker();

}

function filterSeedlinkMetadata(queryObject) {

  // Create a copy of the global latencies map
  var results = GLOBAL_STATIONS

  // Go over all submitted keys
  Object.keys(queryObject).forEach(function(parameter) {

    // Input values as array (support comma delimited)
    values = queryObject[parameter].split(",");

  })

  var filtered_results = new Object()
  values.forEach(function (key) {
    filtered_results[key] = results[key]
  });

  return filtered_results;

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

function SeedlinkChecker() {

  /* Function SeedlinkChecker
   * Checks if Seedlink is present
   * Returns all metadata: networks, stations, sites
   */

  // Container with seedlink hosts and ports
  var SEEDLINK = CONFIG.SEEDLINK

  SEEDLINK.map(function(x) {
    var seedlink_host = ((x['hostport']).split(":"))[0]
    var seedlink_port = ((x['hostport']).split(":"))[1]

    // Open a new TCP socket
    var socket = new Network.Socket()

    // Create a new empty buffer
    var buffer = new Buffer(0);
    var records = new Array();

    // Set Timout in milliseconds
    var timeouttime = 10000
    socket.setTimeout(timeouttime);

    // When the connection is established write write info
      socket.connect(seedlink_port, seedlink_host, function() {
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

        // Return SEEDLINK buffer as json response
        var seedlink_buffer_json = parseRecords(buffer)
        GLOBAL_STATIONS[seedlink_host + ":" + seedlink_port] = seedlink_buffer_json
      }

    });

    // Oops
    socket.on("error", function(error) {
	 GLOBAL_STATIONS[seedlink_host + ":" + seedlink_port] = "error"
    });
  
    socket.on('timeout', () => {
	 GLOBAL_STATIONS[seedlink_host + ":" + seedlink_port] = null
      socket.end();
    });

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

  return result

}
