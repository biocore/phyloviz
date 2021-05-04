define(["underscore", "util", "TreeController"], function (
    _,
    util,
    TreeController
) {
    /**
     * Stores the next unique number for the removeLayer button is ShearLayer
     */
    var UniqueRemoveNum = 0;

    /**
     * Returns a unique number to use for the id of the removeLayer button.
     */
    function getUniqueNum() {
        return UniqueRemoveNum++;
    }

    /**
     * @class ShearLayer
     *
     * Create a new shear layer and adds it to the shear panel
     */
    function ShearLayer(
        fCol,
        fVals,
        container,
        chkBxClickFunction,
        removeClickFunction,
        selectAllFunction,
        unselectAllFuntion
    ) {
        this.fCol = fCol;
        this.fVals = fVals;
        this.container = container;
        this.layerDiv = null;
        this.inputs = [];
        this.values = [];

        var scope = this;

        // create layer div
        this.layerDiv = document.createElement("div");
        this.container.insertBefore(this.layerDiv, this.container.firstChild);

        // create border line
        this.layerDiv.appendChild(document.createElement("hr"));

        // create checkbox legend title
        var legendTitle = document.createElement("div");
        this.layerDiv.appendChild(legendTitle);
        legendTitle.innerText = this.fCol;
        legendTitle.classList.add("legend-title");

        // // create container for select/unselect all buttons
        var p = document.createElement("p");
        this.layerDiv.appendChild(p);

        // create the select all button
        var button = document.createElement("button");
        button.innerText = "Select all";
        button.onclick = function () {
            _.each(scope.inputs, function (input) {
                input.select();
            });
            selectAllFunction(scope.fCol);
        };
        button.setAttribute("style", "margin: 0 auto;");
        p.appendChild(button);

        // create the unselect all button
        button = document.createElement("button");
        button.innerText = "Unselect all";
        button.onclick = function () {
            _.each(scope.inputs, function (input) {
                input.unselect();
            });
            unselectAllFuntion(scope.fCol, _.clone(scope.values));
        };
        button.setAttribute("style", "margin: 0 auto;");
        p.appendChild(button);

        // create checkbox legend div
        var chkBoxLegendDiv = document.createElement("div");
        this.layerDiv.appendChild(chkBoxLegendDiv);
        chkBoxLegendDiv.classList.add("barplot-layer-legend");
        chkBoxLegendDiv.classList.add("legend");

        // create chcbox div
        var legendChkBoxs = document.createElement("div");
        chkBoxLegendDiv.appendChild(legendChkBoxs);

        // create checkboxes
        var table = document.createElement("table");
        legendChkBoxs.appendChild(table);
        var uniqueNum = 1;
        _.each(this.fVals, function (val) {
            scope.values.push(val);
            var row = document.createElement("tr");
            var id =
                scope.fCol.replaceAll(" ", "-") +
                "-" +
                val.replaceAll(" ", "-") +
                uniqueNum++;

            // add checkbox
            var dataCheck = document.createElement("td");
            var input = document.createElement("input");
            input.id = id;
            input.setAttribute("type", "checkbox");
            input.checked = true;
            input.onchange = function () {
                chkBxClickFunction(!input.checked, scope.fCol, val);
            };

            // the select/unselect functions that the "Select all" and
            // "Unselect all" buttons will call
            input.select = function () {
                input.checked = true;
            };
            input.unselect = function () {
                input.checked = false;
            };

            scope.inputs.push(input);
            dataCheck.appendChild(input);
            row.appendChild(dataCheck);

            // add checkbox label
            var dataLabel = document.createElement("label");
            dataLabel.setAttribute("for", input.id);
            dataLabel.innerText = val;
            row.appendChild(dataLabel);

            // add row to table
            table.appendChild(row);
        });

        // create remove container
        var removeContainer = document.createElement("p");
        this.layerDiv.appendChild(removeContainer);

        // create remove label
        var removeLabel = document.createElement("label");
        removeLabel.innerText = "Remove this layer";
        removeContainer.appendChild(removeLabel);

        // create remove button
        var removeButton = document.createElement("button");
        removeButton.id = "shear-layer-" + getUniqueNum() + "-delete";
        removeButton.innerText = "-";
        removeButton.onclick = function () {
            removeClickFunction(scope.fCol);
            scope.layerDiv.remove();
            scope.layerDiv = null;
        };
        removeContainer.appendChild(removeButton);

        removeLabel.setAttribute("for", removeButton.id);
    }

    /**
     * @class ShearModel
     *
     * The model for Shearer. This model is responsible for maintaining updating
     * empress whenever a user clicks on a shear option in one of the shear
     * layers. This model is also responsible for notifying its observers
     * whenever the shear status of the tree has changed.
     */
    function ShearModel(empress, container) {
        this.empress = empress;
        this.layers = new Map();
        this.shearMap = new Map();
        this.container = container;
        this.observers = [];
    }

    /**
     * Adds a shear layer to the shear panel.
     *
     * @param{String} layer The feateure metadata column to create a shear layer
     *                     from.
     */
    ShearModel.prototype.addLayer = function (layer) {
        var fVals = this.empress.getUniqueFeatureMetadataInfo(layer, "tip")
            .sortedUniqueValues;
        var layerObj = new ShearLayer(
            layer,
            fVals,
            this.container,
            (add, lyr, val) => {
                ShearModel.addRemoveShearItem(this, add, lyr, val);
            },
            (lyr) => {
                ShearModel.removeLayer(this, lyr);
            },
            (lyr) => {
                ShearModel.clearShearMapLayer(this, lyr);
            },
            (lyr, values) => {
                ShearModel.setShearMapLayer(this, lyr, values);
            }
        );
        this.layers.set(layer, layerObj);
    };

    /**
     * Returns the feature values the have been unselected (i.e. sheared) from
     * a particular shear layer.
     *
     * @param{String} layer The name of shear layer
     */
    ShearModel.prototype.getShearLayer = function (layer) {
        return this.shearMap.get(layer);
    };

    /**
     * Checks if a shear layer has been create for a particular feature metadata
     * column.
     *
     * @param{String} layer The feature metadata column to check
     */
    ShearModel.prototype.hasLayer = function (layer) {
        return this.layers.has(layer);
    };

    /**
     * Notifies all observers whenever the model has changed.
     */
    ShearModel.prototype.notify = function () {
        this.empress.shear(this.shearMap);
        this.empress.drawTree();
        _.each(this.observers, function (obs) {
            obs.shearUpdate();
        });
    };

    /**
     * Registers an observer to the model which will then be notified whenever
     * the model is updated. Note this object must implement a shearUpdate()
     * method.
     *
     * @param{Object} obs The object to register.
     */
    ShearModel.prototype.registerObserver = function (obs) {
        this.observers.push(obs);
    };

    /**
     * Removes a shear layer from a ShearModel
     * @param{ShearModel} model The ShearModel to use
     * @param{String} layer The name of layer to remove.
     */
    ShearModel.removeLayer = function (model, layer) {
        model.layers.delete(layer);
        model.shearMap.delete(layer);
        model.notify();
    };

    /**
     * Clears the shearMap.
     *
     * @param{ShearModel} model The ShearModel to use
     * @param{String} layer The feature metadata column name of the shear layer
     */
    ShearModel.clearShearMapLayer = function (model, layer) {
        model.shearMap.set(layer, []);
        model.notify();
    };

    /**
     * sets a shear layer within the shearMap.
     *
     * @param{ShearModel} model The ShearModel to use.
     * @param{String} layer The feature metadata column name of the shear layer
     * @param{Array} values An array of feature metadata value
     */
    ShearModel.setShearMapLayer = function (model, layer, values) {
        model.shearMap.set(layer, values);
        model.notify();
    };

    /**
     * Adds or removes a shear value from a shear layer.
     * @param{ShearModel} model The ShearModel to use.
     * @param{Boolean} remove Whether or not to remove val from the shear layer
     * @param{String} layer The name of feature metadata column of shear layer
     * @param{String} val The feature metadata column value to add or remove
     *                    from layer.
     */
    ShearModel.addRemoveShearItem = function (model, remove, layer, val) {
        if (remove) {
            ShearModel.addShearItem(model, layer, val);
        } else {
            ShearModel.removeShearItem(model, layer, val);
        }
    };

    /**
     * Adds a shear value from a shear layer.
     * @param{ShearModel} model The ShearModel to use.
     * @param{String} layer The name of feature metadata column of shear layer
     * @param{String} val The feature metadata column value to add or remove
     *                    from layer.
     */
    ShearModel.addShearItem = function (model, layer, val) {
        if (model.shearMap.has(layer)) {
            model.shearMap.get(layer).push(val);
        } else {
            model.shearMap.set(layer, [val]);
        }
        model.notify();
    };

    /**
     * Removes a shear value from a shear layer.
     * @param{ShearModel} model The ShearModel to use.
     * @param{String} layer The name of feature metadata column of shear layer
     * @param{String} val The feature metadata column value to add or remove
     *                    from layer.
     */
    ShearModel.removeShearItem = function (model, layer, val) {
        var items = model.getShearLayer(layer);
        if (items === undefined) {
            return;
        }
        var index = items.indexOf(val);
        if (index > -1) {
            items.splice(index, 1);
        }
        model.notify();
    };

    /**
     * @class ShearController
     *
     * The controller for a ShearModel.
     */
    function ShearController(empress, container) {
        this.model = new ShearModel(empress, container);
    }

    /**
     * Adds a layer to the model.
     * @param{String} layer A feature metadata column name
     */
    ShearController.prototype.addLayer = function (layer) {
        if (!this.model.hasLayer(layer)) {
            this.model.addLayer(layer);
        }
    };

    /**
     * Registers an observer to the model.
     *
     * @param{Object} obs The object to register to the model
     */
    ShearController.prototype.registerObserver = function (obs) {
        this.model.registerObserver(obs);
    };

    /**
     * @class Shearer
     *
     * This is the exposed only exposed class of this closure and the one that
     * the rest of the empress code base will interact with.
     */

    function Shearer(empress, fCols) {
        this.fCols = fCols;
        this.shearSelect = document.getElementById("shear-feature-select");
        this.addLayerButton = document.getElementById("shear-add-btn");
        this.shearContainer = document.getElementById("shear-legends");
        this.controller = new ShearController(empress, this.shearContainer);

        var scope = this;
        _.each(this.fCols, function (col) {
            var opt = document.createElement("option");
            opt.innerText = col;
            opt.value = col;
            scope.shearSelect.appendChild(opt);
        });

        this.addLayerButton.onclick = function () {
            scope.controller.addLayer(scope.shearSelect.value);
            scope.shearSelect[scope.shearSelect.selectedIndex].remove();
        };
    }

    /**
     * Add metadata values back into the shear select container.
     */
    Shearer.prototype.shearUpdate = function () {
        // clear select
        this.shearSelect.innerHTML = "";

        // add feature metadata values that do not have a layer
        var scope = this;
        _.each(this.fCols, function (col) {
            if (!scope.controller.model.layers.has(col)) {
                var opt = document.createElement("option");
                opt.innerText = col;
                opt.value = col;
                scope.shearSelect.appendChild(opt);
            }
        });
    };

    /**
     * Registers an observer to the model.
     *
     * @param{Object} obs The object to register to the model
     */
    Shearer.prototype.registerObserver = function (obs) {
        this.controller.registerObserver(obs);
    };

    return Shearer;
});
