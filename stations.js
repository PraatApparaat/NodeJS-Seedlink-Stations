const Network = require("net");
const Http = require("http");
const CONFIG = require("./config");
const url = require("url");
const querystring = require("querystring");

// Global container for Stations
var GLOBAL_STATIONS = new Object()

function validateParameters(queryObject) {

  const ALLOWED_PARAMETERS = [
    "host",
  ];

  // Check if all parameters are allowed
  Object.keys(queryObject).forEach(function(x) {
    if(ALLOWED_PARAMETERS.indexOf(x) === -1) {
      throw("Key " + x + " is not supported");
    }
  });

}

module.exports = function(callback) {

  setInterval(SeedlinkChecker, CONFIG.REFRESH_INTERVAL);
  SeedlinkChecker();

  // Create a HTTP server
  const Server = Http.createServer(function(request, response) {

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET");

    var uri = url.parse(request.url);
    var queryObject = querystring.parse(uri.query);

    if(uri.query === null || uri.query === "") {
      return HTTPError(response, 400, "Empty query string submitted");
    }

    if(!Object.prototype.hasOwnProperty.call(queryObject, "host")) {
      return HTTPError(response, 400, "Host parameter is required");
    }

    // Only root path is supported
    if(uri.pathname !== "/") {
      return HTTPError(response, 405, "Method not supported")
    }

    // Sanitize user input
    try {
      validateParameters(queryObject);
    } catch(exception) {
      return HTTPError(response, 400, exception);
    }

    response.end(JSON.stringify(filterSeedlinkMetadata(queryObject)));

  });

  // Listen to incoming HTTP connections
  Server.listen(CONFIG.PORT, CONFIG.HOST, function() {
    if(typeof callback === "function") {
      callback();
    }
  });

}

function filterSeedlinkMetadata(queryObject) {

  // Create a copy of the global latencies map
  var requestedHosts = queryObject.host.split(",");

  return Object.keys(GLOBAL_STATIONS).filter(function(x) {
    return requestedHosts.indexOf(x) !== -1;
  }).map(function(x) {
    return {
      "host": x,
      "stations": GLOBAL_STATIONS[x]
    };
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

function SeedlinkChecker() {

  /* Function SeedlinkChecker
   * Checks if Seedlink is present
   * Returns all metadata: networks, stations, sites
   */

  const CAT_COMMAND = "CAT\r\n";

  // Container with seedlink hosts and ports
  CONFIG.SERVERS.forEach(function(SERVER) {

    // Open a new TCP socket
    var socket = new Network.Socket()

    // Create a new empty buffer
    var buffer = new Buffer(0);

    // Set Timout in milliseconds
    socket.setTimeout(CONFIG.SOCKET.TIMEOUT);

    // e.g. ECONNREFUSED
    socket.on("error", function() {
      GLOBAL_STATIONS[SERVER.HOST] = null;
      socket.destroy();
    });

    // Timeout
    socket.on("timeout", function() {
      GLOBAL_STATIONS[SERVER.HOST] = null;
      socket.destroy();
    });

    // When the connection is established write write info
    socket.connect(SERVER.PORT, SERVER.HOST, function() {
      socket.write(CAT_COMMAND);
    });

    // Data is written over the socket
    socket.on("data", function(data) {

      // Extend the buffer with new data
      buffer = Buffer.concat([buffer, data]);

      if(buffer.lastIndexOf("\nEND") === buffer.length - 4) {

        GLOBAL_STATIONS[SERVER.HOST] = parseBuffer(buffer);

        // Destroy the socket
        socket.destroy();

      }

    });

  });


}

function parseBuffer(buffer) {

  // Cut off the END
  buffer = buffer.slice(0, buffer.lastIndexOf("\nEND"));

  // Split by line and map result
  return buffer.toString().split("\n").map(function(x) {
    return {
      "network": x.slice(0, 2).trim(),
      "station": x.slice(3, 8).trim(),
      "site": x.slice(9, x.length).trim()
    }
  });

}
