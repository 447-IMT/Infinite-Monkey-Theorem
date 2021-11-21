var map;
var mapDoc;
var mapBounds;
var mapTopUse;

var counties;
var facilityCircles;

var tooltip;

window.addEventListener("load", prepWindow, false);

// Main display setup
function prepWindow() {
    map = document.getElementById("mapid");
    mapDoc = map.contentDocument;
    mapBounds = map.getBoundingClientRect();
    topCountyUseElem = mapDoc.getElementById("top-county");
	topFacilityUseElem = mapDoc.getElementById("top-facility")
    counties = Array.from(mapDoc.getElementsByClassName("county"));

    tooltip = document.getElementById("counties-tooltip");
	
	// Error loading html, yeet out of script
    if (map.contentDocument === null || map.contentDocument === undefined) {
        alert("Failed to apply style to SVG.");
        return;
    }
	
	// Resize map bounds whenever page is resized or zoomed
    window.addEventListener("resize", (evt) => { mapBounds = map.getBoundingClientRect(); });
	
	// Call updateMap() when calendar date is changed
	document.getElementById("date").addEventListener("input", updateMap, false);
	
    var facilities = fetch("data/facilities.json")
		.then(response => response.json())
		.then(json => {
			drawFacilities(json);
			
			facilityCircles = Array.from(mapDoc.getElementsByTagName("circle"));

			addMapListeners();

			updateMap();
		});
}

function addMapListeners() {
	// For each county and facility on the map...
    (counties.concat(facilityCircles)).forEach((element) => {
        // whenever the mouse moves on this element, move the tooltip to the mouse's position
        element.addEventListener("mousemove", (evt) => {
            tooltip.style.left = evt.clientX + mapBounds.left + 'px';
            tooltip.style.top = evt.clientY + mapBounds.top + 'px';
        }, false);
	});

	counties.forEach(element => {
		// when the mouse enters this county, update the tooltip and change the county stroke
        element.addEventListener("mouseenter", (evt) => {
            element.style["stroke"] = '#fff';
            element.style["stroke-width"] = '1';

            // re-draw this county on top of the rest of the svg
            topCountyUseElem.setAttribute("href", "#" + element.id);

			var entry = JSON.parse(element.getAttribute("coviddata"));

            tooltip.innerText = element.getAttribute("name") + " County" + "\nDate: " + entry.date + "\nCount: " + entry.count;
            tooltip.style.display = "unset";
        }, false);

		// when the mouse leaves this element, unset stroke modifications and re-hide tooltip
		element.addEventListener("mouseout", (evt) => {
			element.style["stroke"] = null;
			element.style["stroke-width"] = null;

			// reset the use element so the element isn't drawn on top anymore
			topCountyUseElem.setAttribute("href", null);

			tooltip.style.display = null;
		}, false);
    });

	facilityCircles.forEach(element => {
		// when the mouse enters this facility, update the tooltip and change the circle's stroke
        element.addEventListener("mouseenter", (evt) => {
            element.style["stroke"] = '#fff';
            element.style["stroke-width"] = '1';

            // re-draw this facility on top of the rest of the svg
            topFacilityUseElem.setAttribute("href", "#" + element.id);

            tooltip.innerText = element.getAttribute("name");
            tooltip.style.display = "unset";
        }, false);

		// when the mouse leaves this element, unset stroke modifications and re-hide tooltip
		element.addEventListener("mouseout", (evt) => {
			element.style["stroke"] = null;
			element.style["stroke-width"] = null;

			// reset the use element so the element isn't drawn on top anymore
			topFacilityUseElem.setAttribute("href", null);

			tooltip.style.display = null;
		}, false);
    });
}

// Update county colors to reflect active date
function updateMap() {
	var date = document.getElementById("date").value; // String with format "YYYY:MM:DD"
	var isoDate = date.replace(":", "-");
	var json = JSON.parse(requestDateData(date)); // Grab data from Apache
	
	var countydata = json["counties"];	// Each entry is a County instance: <date, count>
	var prisondata = json["prisons"];	// Each entry is a Prison instance: <date, count>
	
	var max = -Infinity;
	var min = Infinity;

	counties.forEach(element => {
		var FIPScode = element.getAttribute("fips");
		var entry = countydata[FIPScode];

		if (entry.count > max) max = entry.count;
		if (entry.count < min) min = entry.count; 
	});

	var diff = max - min;


	// For each county on map...
    counties.forEach(element => {
		var FIPScode = element.getAttribute("fips");
		
		// Check if entry for FIPScode exists
		if (FIPScode in countydata) {
			var entry = countydata[FIPScode]; // entry = <date, count>

			// normalize color base
			var base = 1 - ((entry.count - min) / diff);

			// Set color based on count
			if (entry.date == isoDate) {
				// If matching date, full saturation
				element.style["fill"] = 'hsl(192,100%,'+ (base * 70 + 20) +'%)';
			} else {
				// If date doesn't match, zero saturation
				element.style["fill"] = 'hsl(192,0%,'+ (base * 70 + 20) +'%)';
			}

			element.setAttribute("coviddata", JSON.stringify(entry));
		}
    });
	
	// For each facility circle on map...
	facilityCircles.forEach(element => {
		var id = element.getAttribute("id");
		
		// Check if entry for prison id exists
		if (id in prisondata) {
			var entry = prisondata[id]; // entry = <date, count>
			
			// normalize color base
			var base = 1 - ((entry.count - min) / diff);

			// Set color based on count
			if (entry.date == isoDate) {
				// If matching date, full saturation
				element.style["fill"] = 'hsl(32,100%,'+ (base * 70 + 20) +'%)';
			} else {
				// If date doesn't match, zero saturation
				element.style["fill"] = 'hsl(32,0%,'+ (base * 70 + 20) +'%)';
			}
		}
	})
}

// Displays points on map
function drawFacilities(facilities) {
	var coords = facilities.map(facility => new Coord(facility.lon, facility.lat));
    var points = coords.map(convertCoords);
    var normalized = normalizePoints(points);
    var transformed = transformPoints(normalized);

	var facilitiesGroup = mapDoc.getElementById("facilities");

	for (let i = 0; i < facilities.length; i++) {
		let point = transformed[i];
		let facility = facilities[i];

		let circle = mapDoc.createElementNS("http://www.w3.org/2000/svg", "circle");
		circle.classList.add("prison");
		circle.setAttribute("cx", point.x);
		circle.setAttribute("cy", point.y);
		circle.setAttribute("r", 4);
		circle.setAttribute("name", facility.name);
		circle.setAttribute("id", facility.id); // Used in updateMap()
		facilitiesGroup.appendChild(circle);
	}
}

// Transforms coordinates from longitude, latitude to x, y
function convertCoords(coord) {
    var lon = coord.lon;
    var lat = coord.lat;

    var mapWidth = Math.PI;
    var mapHeight = Math.PI / 2;

    var x = (lon + 180) * (mapWidth/180);
    
    var latRad = lat * Math.PI / 180;
    var mercN = Math.log(Math.tan(Math.PI/4 + latRad/2));
    var y = (mapHeight / 2) - (mapWidth * mercN / (2*Math.PI));

    return new Point(x, y*2);
}

// Normalizes points to [0-1] range
function normalizePoints(points) {
    var caliMin = new Point(0.9702356695802884, 0.7614055437283428);

    return points.map((point) => {
        return new Point(point.x - caliMin.x, point.y - caliMin.y);
    });
}

// Transforms points from [0-1] range to map canvas range
function transformPoints(points) {
    var svgInnerWidth = 352.4;
    var caliMaxX = 0.17933544298239068

    var scaleFactor = svgInnerWidth / caliMaxX;
	
    console.log(scaleFactor);

    return points.map((point) => {
        return new Point(point.x * scaleFactor + 35.8, point.y * scaleFactor + 22);
    })
}

// Returns JSON string of data for given date recieved from Apache site (TODO)
function requestDateData(date) {
	return dummydata;
}

// Converts date string to [year, month, day] and returns it
function dateToTriplet(datestring) {
	return [
		datestring.substring(0, 4),
		datestring.substring(5, 7),
		datestring.substring(8, 10)
	];
}

class Coord {
    constructor(lon, lat) {
        this.lon = lon;
        this.lat = lat;
    }
}

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

// Temporary data used in requestDateData()
var dummydata = `
{
	"counties": {
		"06091": {"date": "1977-04-14", "count": 1},
		"06081": {"date": "2009-03-05", "count": 55},
		"06005": {"date": "1989-10-11", "count": 44},
		"06027": {"date": "2007-07-20", "count": 18},
		"06033": {"date": "1990-02-24", "count": 37},
		"06067": {"date": "1950-07-29", "count": 84},
		"06037": {"date": "2009-04-24", "count": 40},
		"06061": {"date": "1962-08-18", "count": 85},
		"06019": {"date": "2017-07-02", "count": 79},
		"06099": {"date": "2015-07-29", "count": 78},
		"06075": {"date": "1989-11-29", "count": 62},
		"06031": {"date": "1999-01-18", "count": 3},
		"06017": {"date": "1975-08-23", "count": 83},
		"06007": {"date": "1993-05-02", "count": 78},
		"06023": {"date": "1970-08-12", "count": 69},
		"06011": {"date": "1978-07-16", "count": 38},
		"06071": {"date": "1960-03-07", "count": 75},
		"06069": {"date": "1982-11-28", "count": 31},
		"06087": {"date": "1971-07-02", "count": 34},
		"06073": {"date": "1974-03-12", "count": 40},
		"06029": {"date": "1972-05-06", "count": 26},
		"06035": {"date": "1994-10-09", "count": 91},
		"06079": {"date": "1976-09-09", "count": 12},
		"06097": {"date": "2012-06-16", "count": 24},
		"06001": {"date": "2017-06-04", "count": 59},
		"06003": {"date": "1962-07-17", "count": 53},
		"06063": {"date": "1967-01-05", "count": 91},
		"06047": {"date": "1975-01-26", "count": 20},
		"06103": {"date": "1960-08-22", "count": 73},
		"06109": {"date": "2002-06-05", "count": 16},
		"06107": {"date": "1998-01-30", "count": 12},
		"06111": {"date": "1967-08-26", "count": 9},
		"06021": {"date": "1978-06-09", "count": 94},
		"06089": {"date": "1992-02-30", "count": 69},
		"06057": {"date": "1957-10-14", "count": 43},
		"06015": {"date": "1959-04-30", "count": 99},
		"06083": {"date": "2017-10-04", "count": 16},
		"06039": {"date": "1984-07-11", "count": 83},
		"06043": {"date": "1950-04-19", "count": 43},
		"06041": {"date": "2002-07-01", "count": 72},
		"06065": {"date": "1998-05-27", "count": 42},
		"06009": {"date": "1954-02-04", "count": 75},
		"06055": {"date": "1975-04-06", "count": 86},
		"06049": {"date": "2018-09-30", "count": 16},
		"06115": {"date": "1996-06-10", "count": 82},
		"06101": {"date": "2007-07-20", "count": 55},
		"06095": {"date": "1989-09-29", "count": 54},
		"06045": {"date": "2000-11-29", "count": 27},
		"06013": {"date": "2016-10-11", "count": 51},
		"06093": {"date": "1990-09-30", "count": 86},
		"06025": {"date": "1985-04-24", "count": 31},
		"06053": {"date": "1975-08-26", "count": 63},
		"06059": {"date": "2011-03-05", "count": 26},
		"06085": {"date": "1986-10-16", "count": 86},
		"06113": {"date": "1952-05-13", "count": 85},
		"06051": {"date": "2007-11-12", "count": 35},
		"06105": {"date": "1962-09-16", "count": 58},
		"06077": {"date": "1964-01-03", "count": 39}
	},
	"prisons": {
		"83": {"date": "2007-01-06", "count": 91},
		"88": {"date": "1987-04-18", "count": 70},
		"89": {"date": "2006-02-23", "count": 41},
		"90": {"date": "1997-03-18", "count": 38},
		"91": {"date": "1984-01-28", "count": 98},
		"92": {"date": "2010-01-06", "count": 31},
		"93": {"date": "1985-10-16", "count": 34},
		"94": {"date": "2012-04-27", "count": 12},
		"95": {"date": "2001-05-30", "count": 54},
		"96": {"date": "2003-02-20", "count": 18},
		"97": {"date": "1955-05-18", "count": 6},
		"98": {"date": "1955-11-26", "count": 94},
		"99": {"date": "1999-06-25", "count": 21},
		"100": {"date": "1956-08-30", "count": 42},
		"101": {"date": "1961-05-26", "count": 40},
		"102": {"date": "2010-06-21", "count": 20},
		"111": {"date": "1951-05-17", "count": 65},
		"112": {"date": "1974-11-06", "count": 18},
		"113": {"date": "1966-10-22", "count": 29},
		"115": {"date": "2007-08-26", "count": 80},
		"116": {"date": "1982-04-22", "count": 23},
		"120": {"date": "1969-11-06", "count": 7},
		"128": {"date": "1952-08-13", "count": 85},
		"129": {"date": "1956-11-06", "count": 74},
		"131": {"date": "2013-06-01", "count": 74},
		"135": {"date": "1984-11-30", "count": 19},
		"139": {"date": "1950-03-30", "count": 77},
		"140": {"date": "1996-10-26", "count": 76},
		"141": {"date": "2012-04-05", "count": 22},
		"142": {"date": "1955-01-17", "count": 89},
		"143": {"date": "2017-08-24", "count": 0},
		"144": {"date": "2004-03-06", "count": 3},
		"145": {"date": "1959-05-03", "count": 59},
		"147": {"date": "2002-07-04", "count": 31},
		"148": {"date": "1996-04-18", "count": 90},
		"150": {"date": "2000-05-16", "count": 84},
		"152": {"date": "1970-02-07", "count": 4},
		"158": {"date": "1985-09-09", "count": 21},
		"161": {"date": "1976-09-22", "count": 47},
		"164": {"date": "1985-08-03", "count": 84},
		"171": {"date": "1986-09-12", "count": 23},
		"1724": {"date": "2017-04-29", "count": 50},
		"1725": {"date": "1972-05-14", "count": 20},
		"1726": {"date": "1998-01-08", "count": 78},
		"1727": {"date": "2007-11-01", "count": 21},
		"1879": {"date": "1953-05-08", "count": 5},
		"2178": {"date": "1991-07-23", "count": 55},
		"2340": {"date": "1964-06-05", "count": 29},
		"2361": {"date": "2011-03-19", "count": 19},
		"2381": {"date": "1994-04-02", "count": 97},
		"2390": {"date": "1987-11-09", "count": 16},
		"2392": {"date": "2014-11-23", "count": 98},
		"2402": {"date": "1963-02-27", "count": 7},
		"2428": {"date": "1951-01-16", "count": 37},
		"2439": {"date": "1995-04-01", "count": 73},
		"2445": {"date": "1986-06-30", "count": 1}
	}
}

`;
