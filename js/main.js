
var INFOWINDOW_TEMPLATE = `
<div id="infowindowWrapper" class="card">
      <div class="card-block">
        <h4 data-bind="text: infowindowTitle" class="card-title"></h4>
        <h6 data-bind="text: infowindowSubtitle" class="card-subtitle text-muted"></h6>
        <h6 data-bind="text: infowindowType" class="card-subtitle text-muted"></h6>
        <h6 data-bind="text: infowindowCapacity" class="card-subtitle text-muted"></h6>


      </div>
      <div data-bind="visible: showStreetView"  id="infowindow_pano" class="card-img-top"></div>
      <br>
      <button data-bind="text: infowindowFavButtonText, click: onClickFavouriteButton, css: infowindowFavButtonType" type="button" class="btn">
      </button>

      <div class="card-block">
        <div data-bind="visible: showStreetViewError" class="alert alert-danger role=alert">
          <span class="glyphicon glyphicon-exclamation-sign"></span>
          Couldn't load data from Google StreetView.
        </div>
      </div>
    </div>
`;


var map;

// view model used by KO.js
var viewModel = {
    query: ko.observable(''),
    firestoreData: ko.observableArray(),
    favourites: ko.observableArray(),
    largeInfowindow: null,
    listClick: function(place) {
      if (isGoogleMapsLoaded()) {
        var marker = place.marker;
        toggleBounce(marker);
        populateInfoWindow(marker, viewModel.largeInfowindow);
      } else {
        googleMapsError();
      }
    },
    infowindowTitle: ko.observable(''),
    infowindowSubtitle: ko.observable(''),
    infowindowCapacity: ko.observable(''),
    infowindowType: ko.observable(''),
    infowindowID: ko.observable(''),
    showStreetViewError: ko.observable(true),
    showStreetView: ko.observable(true),
    filterRingRack: ko.observable(false),
    filterGroundRack: ko.observable(false),
    filterInvertedRack: ko.observable(false)
};

$(function() {
  viewModel.places = ko.computed(function() {
    var search = viewModel.query().toLowerCase();
    var filteredPlaces = viewModel.firestoreData().filter(place => place.address.toLowerCase().indexOf(search) >= 0);

    if (viewModel.filterRingRack()) {
        filteredPlaces = filteredPlaces.filter(place => place.type == "RING RACK");
    }

    updateMarkers(filteredPlaces);
    return filteredPlaces.filter(place => !isFavourite(place.ID));

  });


  viewModel.infowindowFavourite = ko.computed(function() {
      console.log(viewModel.infowindowID());
    return isFavourite(viewModel.infowindowID());
  });

  viewModel.infowindowFavButtonText = ko.computed(function() {
      return viewModel.infowindowFavourite() ? "Unfavourite" : "Favourite";
  });

  viewModel.infowindowFavButtonType = ko.computed(function(){
    return viewModel.infowindowFavourite() ? "btn-warning" : "btn-primary";
  });

  viewModel.ringRackButtonType = ko.computed(function() {
     return viewModel.filterRingRack() ? "btn-primary" : "btn-default";
  });

  // Called after the favourite button is pressed.
  // We add or remove the place from favourites depending on if it's already a favourite.
  viewModel.onClickFavouriteButton = function() {
    var ID = viewModel.infowindowID();
    if (isFavourite(ID)) {
      viewModel.favourites.remove(function(item) {return item.ID == ID});
    } else {
        var place = viewModel.firestoreData()[getPlaceIndex(ID)];
      viewModel.favourites.push({ID: ID, address: place.address});
    }
  };

  viewModel.toggleRingRack = function() {
      viewModel.filterRingRack(!viewModel.filterRingRack());
  };

  ko.applyBindings(viewModel);
});

// Update the markers in the map. If the marker is not in filtered places,
// we hide them.
function updateMarkers(filteredPlaces) {
  // Only run this code if Google Maps is loaded
  if (isGoogleMapsLoaded()) {
    // First we hide all the markers.
    viewModel.firestoreData().forEach(place => place.marker.setVisible(false));
    // Then we show the markers for the filtered places
    filteredPlaces.forEach(place => place.marker.setVisible(true));
  }
}

// Initialize the Google map
var initMap = function() {
    console.log("init");


  // Constructor creates a new map with center and zoom
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: 43.4822754, lng: -80.5817388},
    zoom: 15
  });

  viewModel.largeInfowindow = new google.maps.InfoWindow();

  loadFirebaseData(map);


  google.maps.event.addDomListener(window, "resize", function() {
    var center = map.getCenter();
    google.maps.event.trigger(map, "resize");
    map.setCenter(center);
  });
};

var googleMapsError = function() {
  $("#googleMapsErrorModal").modal('show');
};

// Animate a bounce for the specified Google Maps marker
function toggleBounce(marker) {
  // Only run this code if Google Maps is loaded
  if (marker.getAnimation() !== null) {
    marker.setAnimation(null);
  } else {
    marker.setAnimation(google.maps.Animation.BOUNCE);
    setTimeout(function () {
      marker.setAnimation(null);
    }, 700);
  }
}

var opened = false;

// Populate and display the info window on the Google Map
function populateInfoWindow(marker, infowindow) {
    console.log("populateInfoWindow");
  if (infowindow.marker != marker) {
    infowindow.marker = marker;
    infowindow.open(map,marker);

    infowindow.addListener('closeclick',function(){
      infowindow.close();
      infowindow.marker = null;
    });


    var streetViewService = new google.maps.StreetViewService();

    // Set the template for info window content
    infowindow.setContent(INFOWINDOW_TEMPLATE);
    var infoWindowNode = $("#infowindowWrapper").get(0);
    ko.applyBindings(viewModel, infoWindowNode);

    // Replace the content of the info window template with relevant details.
    var place = viewModel.firestoreData()[getPlaceIndex(marker.id)];
    viewModel.infowindowTitle(place.address);
    viewModel.infowindowSubtitle(place.description);
    viewModel.infowindowID(place.ID);
    viewModel.infowindowCapacity("Capacity: " + place.capacity);
    viewModel.infowindowType("Type: " + place.type);

    function getStreetView(data, status) {
      if (status == google.maps.StreetViewStatus.OK) {
        viewModel.showStreetViewError(false);
        addStreetViewToInfowindow(data, marker, infowindow);
      } else {
        // If there's an error with loading StreetView we show the error message
        // and we also hide the StreetView panorama div
        viewModel.showStreetViewError(true);
      }
    }

    streetViewService.getPanoramaByLocation(marker.position, 50 /*radius*/, getStreetView);
    infowindow.open(map, marker);
  }
}

// Add streetview image to the div specified in the info window template
function addStreetViewToInfowindow(data, marker, infowindow) {
  var nearStreetViewLocation = data.location.latLng;
  var  heading = google.maps.geometry.spherical.computeHeading(
    nearStreetViewLocation, marker.position);

    var panoramaOptions = {
      position: nearStreetViewLocation,
      pov: {
        heading: heading,
        pitch: 30
      }
    };

  var panorama = new google.maps.StreetViewPanorama(
    document.getElementById('infowindow_pano'), panoramaOptions);
}


// Returns true if the place with this name is infowindowTitle favourite
function isFavourite(ID) {
  var isFavourite = false;
  // we loop through all the favourites, and see if there's infowindowTitle favourite
  // with this ID. If there is, we set isFavourite to true, and break the loop
  for(var j = 0; j < viewModel.favourites().length; j++) {
    if (ID == viewModel.favourites()[j].ID) {
      isFavourite = true;
      break;
    }
  }
  return isFavourite;
}


// Get the place index for the place with the same name
function getPlaceIndex(ID) {
  for(var i = 0; i < viewModel.firestoreData().length; i++) {
    if (ID == viewModel.firestoreData()[i].ID) {
      return i;
    }
  }
  return -1;
}

function isGoogleMapsLoaded() {
  return (typeof google) !== 'undefined';
}


function loadFirebaseData(map) {
    console.log("loadFirebaseData");

    // Initialize Cloud Firestore through Firebase
        var db = firebase.firestore();

    // Disable deprecated features
        db.settings({
            timestampsInSnapshots: true
        });

    var bounds = new google.maps.LatLngBounds();

    // Icons used by the Google maps markers
    var defaultIcon = ("images/default.png");
    var highlightedIcon = ("images/clicked.png");


    // read data
        db.collection("parkingspots").get().then((querySnapshot) => {
            querySnapshot.forEach((doc) => {
            var place = {
                address: doc.data().address,
                capacity: doc.data().capacity,
                description: doc.data().description,
                location: {lat: doc.data().location._lat, lng: doc.data().location._long},
                type: doc.data().type,
                ID: doc.id
            };

        var image = ("images/default.png");
        var marker = new google.maps.Marker({
            map: map,
            position: place.location,
            title: place.address,
            animation: google.maps.Animation.DROP,
            id: place.ID,
            icon: image
        });

        place.marker = marker;

        marker.addListener('click', function() {
            populateInfoWindow(this, viewModel.largeInfowindow);
            toggleBounce(this);
        });

        marker.addListener('mouseover', function() {
            this.setIcon(highlightedIcon);
        });

        marker.addListener('mouseout', function() {
            this.setIcon(defaultIcon);
        });

        bounds.extend(marker.position);


        viewModel.firestoreData.push(place);


    });

    var center = {lat: 43.4822754, lng: -80.5817388};
    map.setCenter(center);
    map.fitBounds(bounds);


});

}




