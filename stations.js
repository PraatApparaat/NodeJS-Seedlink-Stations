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
    "station"
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

    if (Object.keys(queryObject).length > 1) {
      return HTTPError(response, 400, "Invalid input, only one parameter allowed")
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

  if (Object.keys(queryObject) == "station") {
    return Object.keys(GLOBAL_STATIONS).filter(function(x) {
	 return GLOBAL_STATIONS[x]["stations"].map(function(x) {
        return x.network + "." + x.station;
      }).indexOf(queryObject.station) !== -1;
    }).map(function(x) {
          return {
            "hostport": x,
            "identifier": GLOBAL_STATIONS[x].identifier,
            "connected": GLOBAL_STATIONS[x] !== null,
            "station": queryObject.station,
            "version": GLOBAL_STATIONS[x].version
          }
        });
  } else if (Object.keys(queryObject) == "hostport") {
    var requestedHosts = queryObject.hostport.split(",");

    return Object.keys(GLOBAL_STATIONS).filter(function(x) {
      return requestedHosts.indexOf(x) !== -1;
    }).map(function(x) {
      return {
        "hostport": x,
        "identifier": GLOBAL_STATIONS[x].identifier,
        "connected": GLOBAL_STATIONS[x] !== null, 
        "stations": GLOBAL_STATIONS[x].stations,
        "version": GLOBAL_STATIONS[x].version
      };
    });
  }
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
  const HELLO_COMMAND = "HELLO\r\n";

  // Container with seedlink hosts and ports
  CONFIG.SERVERS.forEach(function(SERVER) {

    // Define HostPort
    var HOSTPORT = SERVER.HOST + ":" + SERVER.PORT

    var version = null;
    var identifier = null

    // Open a new TCP socket
    var socket = new Network.Socket()

    // Create a new empty buffer
    var buffer = new Buffer(0);

    // Set Timout in milliseconds
    socket.setTimeout(CONFIG.SOCKET.TIMEOUT);

    // e.g. ECONNREFUSED
    socket.on("error", function() {
      GLOBAL_STATIONS[HOSTPORT] = null;
      socket.destroy();
    });

    // Timeout
    socket.on("timeout", function() {
      GLOBAL_STATIONS[HOSTPORT] = null;
      socket.destroy();
    });

    // When the connection is established write write info
    socket.connect(SERVER.PORT, SERVER.HOST, function() {
      socket.write(HELLO_COMMAND);
    });

    // Data is written over the socket
    socket.on("data", function(data) {

      // Extend the buffer with new data
      buffer = Buffer.concat([buffer, data]);

      // Get the Seedlink version
      if(version === null && buffer.toString().split("\r\n").length === 3) {

        // Extract the version
        [version, identifier] = buffer.toString().split("\r\n");
        buffer = new Buffer(0);

        // Proceed with the CAT command
        return socket.write(CAT_COMMAND);

      }

      if(buffer.lastIndexOf("\nEND") === buffer.length - 4) {

        // Update the global cache
        GLOBAL_STATIONS[HOSTPORT] = {
          "stations": parseBuffer(buffer), 
          "identifier": identifier,
          "version": version
        }

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
