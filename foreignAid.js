


function addCommas(nStr)
{
	nStr += '';
	x = nStr.split('.');
	x1 = x[0];
	x2 = x.length > 1 ? '.' + x[1] : '';
	var rgx = /(\d+)(\d{3})/;
	while (rgx.test(x1)) {
		x1 = x1.replace(rgx, '$1' + ',' + '$2');
	}
	return x1 + x2;
}

function roundNumber(num, dec) {
	return result = Math.round(num*Math.pow(10,dec))/Math.pow(10,dec);
}



var xy = d3.geo.mercator();
var path = d3.geo.path().projection(xy);

var currentYear=1946;

//dxy object is used to control panning and zooming
var dxy = {};
dxy.mousedown = false;
dxy.zooming = false;
dxy.zoomLevel = 500;

//setup the events for panning/zooming
//These are added to the window (instead of the svg) since it is common to 
//move the mouse outside the window while dragging
d3.select(window)
	.on("keydown", function() { 
		//keyCode 17 is 'ctrl'
		if (d3.event.keyCode == 17) {
			dxy.zooming = true;
		}
	} )
	.on ("keyup", function() { dxy.zooming = false; } )
	.on("mouseup", function(d) {
		if (dxy.mousedown == true)
			dxy.mousedown = false;
		else if (dxy.zooming == true)
			dxy.zooming = false;
		
	});
	

//main map svg
//This is just the initialization, the drawing is done later
var countries = d3.select("body")
  .append("svg")
	.attr("width", 960)
	.attr("height",350)
	.on("mousedown", function(d) { 
		dxy.mousedown = true;
		dxy.start = d3.svg.mouse(this); 
		dxy.end = d3.svg.mouse(this);
	})
	.on("mousemove", function(d) {
		if(dxy.mousedown == true || dxy.zooming) {
			dxy.end = d3.svg.mouse(this);
			refresh();
		}
	})
  .append("g")
    .attr("id", "countries");

//dotted line to represent the equator
var equator = d3.select("svg")
  .append("line")
	.attr("class", "equator")
    .attr("x1", "0%")
    .attr("x2", "100%");



///////////////////////////////////////
//These details relate to the bar chart under the map
var numBars = 64;
var barHeight = 80;

var x = d3.scale.linear()
	.domain([0, 1])
	.range([0, 960/numBars]);

var y = d3.scale.linear()
	.domain([0, 40000000000])
	.rangeRound([0, barHeight]);
	
var chart = d3.select("body")
	.append("svg:svg")
	.attr("class", "chart")
	.attr("width", 960)
	.attr("height", barHeight);
///////////////////////////////////////	


//totalSpending variables represent the total 
//funding distributed in that particular year
//
//Values are kept separate so the user can switch views without reloading the csv
// - Historical is the raw value from the data
// - Adjusted is divided by the CPI
var totalSpending = [];
var totalSpendingHistorical = [];
var totalSpendingAdjusted = [];

//greenbook variables contain the spending per country per year
//
//Values are kept separate so the user can switch views without reloading the csv
// - Historical is the raw value from the data
// - Adjusted is divided by the CPI
// - original is the original CSV (lists individual programs)
var greenbook;	
var greenbookHistorical;
var greenbookAdjusted;
var originalGreenbook;

//misc.
var currentCountry = "";
var cpi;
var useHistorical = true;

var max=0;
var fill;


//Load and draw the countries
d3.json("data/world-countries.json", function(collection) {
	countries
		.selectAll("path")
			.data(collection.features)
		.enter().append("path")
		.attr("d", path)
		.attr("id", function(d) { return d.properties.name; })
		.attr("fill","#ccc")
		.on("click", function(d) {
			//this bit of jQuery displays the country details in a table under the map when clicked
			$("#dataTitle h2").text( d.properties.name );
			currentCountry = d.properties.name;
			refresh();
		})
		.append("title")
			.text(function(d) { return d.properties.name; });
	equator
		.attr("y1", xy([0, 0])[1])
		.attr("y2", xy([0, 0])[1])
  
});


//Load up the various data sources.  
//
//D3 loads data asynchronously, but we need CPI data before continuing.
//Therefore, data loading calls are nested synchronously.  Messy looking, but the simplest way.
//Alternative methods can be found here: http://groups.google.com/group/d3-js/browse_thread/thread/204ce9fc70bb8a7
//
d3.csv("data/cpi.csv", function(csv) {
	//load CPI and index by year
	cpi = d3.nest()
		.key(function(d) { return d.Year; } )
		.map(csv);
	
	//next load up the greenbook data (which depends on CPI)
	d3.csv("data/greenbook.csv", function(csv) {
	
		//This is a bit messy.
		//Index by country name, then perform a rollup where individual years are 
		//summed together.  This produces a single value per year per country 
		//(instead of multiple programs per single year per country)
		//
		//Uses raw greenbook values, which are recorded as historical dollars
		greenbookHistorical = d3.nest()
			.key(function(d) { return d.country_name; })
			.rollup(function(a) { 
				var tmp = {};
				for (var year = 1946; year <= 2009; year++) {
					var tYear = "FY" + year;
					for (var i in a) {
						if (tmp[year] == null)
							tmp[year] = parseInt(a[i][tYear]);
						else
							tmp[year] += parseInt(a[i][tYear]);
					}
					
					//max is used for setting up the color scale
					if (tmp[year] > max)
						max = tmp[year];
				}
				return tmp;
			})
			.map(csv); 
		
		//Same as above, except we are dividing each value by the CPI for that year
		//to adjust for inflation over time
		greenbookAdjusted = d3.nest()
			.key(function(d) { return d.country_name; })
			.rollup(function(a) { 
				var tmp = {};
				for (var year = 1946; year <= 2009; year++) {
					var tYear = "FY" + year;
					
					for (var i in a) {
						if (tmp[year] == null)
							tmp[year] = parseInt(a[i][tYear])  / (parseInt(cpi[year][0]["CPI"])/100);
						else
							tmp[year] += parseInt(a[i][tYear])  / (parseInt(cpi[year][0]["CPI"])/100);
					}
					
					if (tmp[year] > max)
						max = tmp[year];
						
					tmp[year] = Math.round(tmp[year]);
				}
				return tmp;
			})
			.map(csv); 
		
		//And finally, just load the original csv so we can display the data table
		originalGreenbook = d3.nest()
			.key(function(d) { return d.country_name; })
			.map(csv);

		
		//Now we compile the total spending for each year, both historical and adjusted
		var tFirst = true;
		for (var i in greenbookHistorical) {
			for (var year = 1946; year <= 2009; year++) {
				if (tFirst) {
					totalSpendingHistorical[year-1946] = parseInt(greenbookHistorical[i][year]) ;
					totalSpendingAdjusted[year-1946] = parseInt(greenbookAdjusted[i][year]) ;
				} else {
					totalSpendingHistorical[year-1946] += parseInt(greenbookHistorical[i][year]);
					totalSpendingAdjusted[year-1946] += parseInt(greenbookAdjusted[i][year]);
				}
			}
			tFirst = false;
		}	
			
		//Set the "working" variables which will be used for display
		if (useHistorical) {
			greenbook = greenbookHistorical;
			totalSpending = totalSpendingHistorical;
		} else { 
			greenbook = greenbookAdjusted;
			totalSpending = totalSpendingAdjusted;
		}
		
		//Draw the bar chart now (which shows total spending for the year)
		chart.selectAll("rect")
			.data(totalSpending)
		.enter().append("svg:rect")
			.attr("x", function(d, i) { return x(i) - .5; })
			.attr("y", function(d) { return barHeight - y(d) - .5; })
			.attr("width", (960/numBars)-2)
			.attr("height", function(d) { return y(d); })
			.attr("id", function(d, i) {  return i+1946; })
			.on("mouseover", function(d, i) { 
				d3.select(this)
					.attr('fill', "red")
					.append("title")
						.text("$" + addCommas(totalSpending[i])); 
			})
			.on("mouseout",  function(d) {  refreshChart(); })
			.on("click", function(d) {  
				//Display the details for that year, and update the map
				currentYear = parseInt(d3.select(this).attr("id")); 
				$("#currentYear").slider({ value: currentYear });
				refresh(); 
			});
		
		//Finally, calculate the color scale for the map.
		//I chose sqrt() because it makes slightly skewed data more dramatic
		//linear() also works but looks more subtle
		//The log() scale is too drastic given the range of values in the data
		fill = d3.scale.sqrt()
		.domain([1, max])
		.range(["#ccc", "red"]);
			
		//Update the UI
		refresh();
		
	}); //End greenbook CSV loading
	
}); //End cpi CSV loading
	

//Format and display data for individual countries in the table below the map
function formatDataTable() {
	if (currentCountry != "") {
		$("#dataTitle h2").text(currentCountry + ": $" + addCommas(greenbook[currentCountry][currentYear]));
		
		//This is probably kludgy, but it works.  
		//Just nuke the tbody rows to erase previous data
		$("#dataTable tbody tr").remove();
		
		//...and add in new rows
		for (program in originalGreenbook[currentCountry]) {
			value = originalGreenbook[currentCountry][program]["FY" + currentYear];
			if (value != 0)	{
			
				//The originalGreenbook data is all historical, so divide by CPI if nescessary
				if (useHistorical) {
					$("#dataTable tbody").append("<tr><td>" + originalGreenbook[currentCountry][program]["program_name"] + "</td><td>$" + addCommas(originalGreenbook[currentCountry][program]["FY" + currentYear]) + "</td></tr>");
				} else {
					$("#dataTable tbody").append("<tr><td>" + originalGreenbook[currentCountry][program]["program_name"] + "</td><td>$" + addCommas(Math.round((originalGreenbook[currentCountry][program]["FY" + currentYear]) / (parseInt(cpi[currentYear][0]["CPI"])/100))) + "</td></tr>");
				}
			}
		}
	}
}


//Needed for the chart hover effect  
function refreshChart() {
	chart.selectAll("rect")
		.attr("fill", function(d, i) { 
			if (i + 1946 === currentYear) {
				return "red";
			} else {
				return "black";
			}			
		});
}  


//Main function to refresh the UI
function refresh() {

	//If we are clicked but not ctrl-clicked...
	if (dxy.mousedown && !dxy.zooming) {
		var translate = xy.translate();
		translate[0] += dxy.end[0]-dxy.start[0];
		translate[1] += dxy.end[1]-dxy.start[1];
		xy.translate(translate);
		
		dxy.start = dxy.end;
	//if we are ctrl-clicked...
	} else if (dxy.mousedown && dxy.zooming) {
		dxy.zoomLevel +=  (dxy.end[1]-dxy.start[1])*0.3;
		xy.scale(dxy.zoomLevel);
	}
  
	//Add per-country data, if applicable
	formatDataTable();
	
	countries.selectAll("path")
		.attr("d", path);
	  
	//Adjust the fill color of each country according to the 
	//financial aid for that year per that country
	for (var country in greenbook) {
		
		//The try/catch statement is nescessary because the greenbook data has some countries
		//which are not represented on the map...and I was too lazy to hand curate them out =)
		try {
			if (greenbook[country][currentYear] != 0 && greenbook[country][currentYear] > 0) {
				countries.select("#" + country)
					.attr("fill", fill(greenbook[country][currentYear]))
					.select("title")
						.text(country + " - $" + addCommas(greenbook[country][currentYear]));
			} else {
				countries.select("#" + country)
					.attr("fill","#ccc");
			}
		}
		catch(err){
			
		}
	}
	
	//update the bar chart
	refreshChart();
	  
	
	equator
		.attr("y1", xy([0, 0])[1])
		.attr("y2", xy([0, 0])[1])


	$("#dataYear h1").text(currentYear + ": $" + addCommas(parseInt(totalSpending[currentYear-1946])));
}


//This redraws the map and bar chart when the user switches from historical to adjusted
function redrawGraphs() {
	
	if (useHistorical) {
		greenbook = greenbookHistorical;
		totalSpending = totalSpendingHistorical;
	} else { 
		greenbook = greenbookAdjusted;
		totalSpending = totalSpendingAdjusted;
	}
	
	chart.selectAll("rect")
			.data(totalSpending)
		.transition()
			.duration(1000)
				.attr("y", function(d) { return barHeight - y(d) - .5; })
				.attr("height", function(d) { return y(d); })
	
}