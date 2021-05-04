define(["underscore", "util"], function (_, util) {
    /**
     * @class BIOMTable
     *
     * Create a BIOM table that describes the features contained within each
     * sample and the metadata associated with each sample.
     *
     * @param{Array} sIDs Array of sample IDs in the table.
     * @param{Array} fIDs Array of feature (or "observation") IDs in the table.
     * @param{Object} sID2Idx Mapping of sample IDs (the values in sIDs) to
     *                        their 0-based indices in sIDs.
     * @param{Object} fID2Idx Mapping of feature IDs (the values in fIDs) to
     *                        their 0-based indices in fIDs.
     * @param{Array} tbl Two-dimensional array where the outermost layer has
     *                   the same length as sIDs. Each position i within tbl
     *                   contains an "inner list" of arbitrary (but in the
     *                   range [1, fIDs.length]) length, containing the fIDs
     *                   indices of the features present within the sample
     *                   in sIDs at index i.
     * @param{Array} smCols Array of sample metadata column names.
     * @param{Array} sm Two-dimensional array where the outermost layer has the
     *                  same length as sIDs. Each position i within sm contains
     *                  an "inner list" of length smCols.length, and sm[i][c]
     *                  refers to the c-th sample metadata column (in smCols)'s
     *                  value for the i-th sample (in sIDs).
     *
     * @return {BIOMTable}
     * constructs BIOMTable
     */
    function BIOMTable(sIDs, fIDs, sID2Idx, fID2Idx, tbl, smCols, sm) {
        // Do some basic validation to make sure that the inputs seem ok.
        // This is useful to have in case the python code gets messed up.
        //
        // NOTE that this is not comprehensive; for example, this doesn't check
        // that all of the sample indices are exactly unique. The main goal
        // here is checking that things seem sane where quickly doable (e.g.
        // length checking) and where things have a reasonable chance of
        // getting messed up (e.g. checking that feature indices in the table
        // are sorted)
        if (sIDs.length !== tbl.length) {
            throw new Error("Sample IDs and table are uneven lengths.");
        } else if (sIDs.length !== sm.length) {
            throw new Error("Sample IDs and metadata are uneven lengths.");
        } else if (sIDs.length !== _.size(sID2Idx)) {
            throw new Error("Sample IDs and ID -> index are uneven lengths.");
        } else if (fIDs.length !== _.size(fID2Idx)) {
            throw new Error("Feature IDs and ID -> index are uneven lengths.");
        }
        _.each(tbl, function (presentFeatureIndices, sIdx) {
            if (presentFeatureIndices.length === 0) {
                // Empty samples should have been removed in python
                throw new Error(
                    'Sample at index "' + sIdx + '" has no features.'
                );
            } else if (presentFeatureIndices.length > fIDs.length) {
                throw new Error(
                    'Sample at index "' +
                        sIdx +
                        '" has more features than ' +
                        "are possible."
                );
            }
            // Verify that the entries of each sample in the table are in
            // strictly increasing order. We rely on this so that we can use
            // binary search when checking if a feature is in a sample.
            var prev;
            _.each(presentFeatureIndices, function (i) {
                if (_.isUndefined(prev)) {
                    prev = i;
                } else {
                    if (i <= prev) {
                        throw new Error(
                            'Sample at index "' +
                                sIdx +
                                '" has ' +
                                "non-strictly-increasing feature indices in table."
                        );
                    }
                }
            });
        });
        this._sIDs = sIDs;
        this._fIDs = fIDs;
        this._sID2Idx = sID2Idx;
        this._fID2Idx = fID2Idx;
        this._tbl = tbl;
        this._smCols = smCols;
        this._sm = sm;

        /**
         * A set of feature ids to ignore. This is whenever the tree is sheared
         * and will contain the features id (tips) that were removed.
         * @ type {Set}
         */
        this.ignorefIdx = new Set();
    }

    /**
     * Converts sample ID to sample index.
     *
     * @param {String} sID
     *
     * @return {Number} sIdx
     *
     * @throws {Error} If the sample ID is unrecognized.
     */
    BIOMTable.prototype._getSampleIndexFromID = function (sID) {
        var sIdx = this._sID2Idx[sID];
        if (_.isUndefined(sIdx)) {
            throw new Error('Sample ID "' + sID + '" not in BIOM table.');
        }
        return sIdx;
    };

    /**
     * Converts feature ID to feature index.
     *
     * @param {String} fID
     *
     * @return {Number} fIdx
     *
     * @throws {Error} If the feature ID is unrecognized.
     */
    BIOMTable.prototype._getFeatureIndexFromID = function (fID) {
        var fIdx = this._fID2Idx[fID];
        if (_.isUndefined(fIdx)) {
            throw new Error('Feature ID "' + fID + '" not in BIOM table.');
        }
        return fIdx;
    };

    /**
     * Converts feature index to feature ID.
     *
     * @param {String} fIdx
     *
     * @return {Number} fID
     *
     * @throws {Error} If the feature index is invalid.
     */
    BIOMTable.prototype._getFeatureIDFromIndex = function (fIdx) {
        var fID = this._fIDs[fIdx];
        if (_.isUndefined(fID)) {
            throw new Error('Feature index "' + fIdx + '" invalid.');
        }
        return fID;
    };

    /**
     * Converts sample metadata column name to index in this._smCols.
     *
     * @param {String} col
     *
     * @return {Number} colIdx
     *
     * @throws {Error} If the column name isn't in this._smCols.
     */
    BIOMTable.prototype._getSampleMetadataColIndex = function (col) {
        var colIdx = _.indexOf(this._smCols, col);
        if (colIdx < 0) {
            throw new Error(
                'Sample metadata column "' + col + '" not in BIOM table.'
            );
        }
        return colIdx;
    };

    /**
     * Converts a set of feature indices to an array of feature IDs.
     *
     * This is a utility method; this conversion operation is surprisingly
     * common in this class' methods.
     *
     * @param {Set} fIdxSet set of feature indices
     *
     * @return {Array} fIDs array of feature IDs
     *
     * @throws {Error} If any of the feature indices are unrecognized.
     */
    BIOMTable.prototype._featureIndexSetToIDArray = function (fIdxSet) {
        var scope = this;
        var fIdxArray = Array.from(fIdxSet);
        return _.map(fIdxArray, function (idx) {
            return scope._getFeatureIDFromIndex(idx);
        });
    };

    /**
     * Returns true if a (sorted) numeric array contains a number.
     *
     * It's important that fIndices is sorted in ascending order, because this
     * lets us use the "isSorted" parameter of _.indexOf(). This will use a
     * binary search, making this check likely faster than manual iteration.
     * See https://underscorejs.org/#indexOf.
     *
     * @param {Array} arr Array of Numbers sorted in ascending order;
     *                    in practice, this will be a sorted array of the
     *                    indices of the features present within a sample
     *                    in the BIOM table
     * @param {Number} num Number to look for the presence of in arr; in
     *                     practice, this will be a feature index to search for
     *
     * @return {Boolean} true if num is present in arr, false otherwise
     */
    BIOMTable.prototype._sortedArrayHasNumber = function (arr, num) {
        return _.indexOf(arr, num, true) >= 0;
    };

    /**
     * Returns true if the table contains a feature name, false otherwise.
     *
     * @param {String} fID
     *
     * @return {Boolean}
     */
    BIOMTable.prototype.hasFeatureID = function (fID) {
        return _.has(this._fID2Idx, fID);
    };

    /**
     * Return the feature IDs shared by the BIOM table and input array
     *
     * @param {Array[String]} other Array of strings to compute the
     *                              intersection against.
     * @return {Array[String]} feature IDs shared by the BIOM table and other.
     */
    BIOMTable.prototype.getObsIDsIntersection = function (other) {
        return _.intersection(this._fIDs, other);
    };

    /**
     * Return the feature IDs in the input array but not in the BIOM table.
     *
     * @param {Array[String]} other Array of strings to compute the
     *                              set-difference against.
     * @return {Array[String]} feature IDs in the input array but not in the
     *                         BIOM table.
     */
    BIOMTable.prototype.getObsIDsDifference = function (other) {
        return _.difference(other, this._fIDs);
    };

    /**
     * Returns a list of observations (features) present in the input samples.
     *
     * @param {Array} samples Array of sample IDs
     *
     * @return {Array} features Array of feature IDs
     *
     * @throws {Error} If any of the sample IDs are unrecognized.
     */
    BIOMTable.prototype.getObservationUnionForSamples = function (samples) {
        var scope = this;
        var totalFeatureIndices = new Set();
        // For each sample...
        _.each(samples, function (sID) {
            // Figure out the indices of the features in this sample.
            // Add these indices to totalFeatureIndices (which is a set,
            // so duplicate indices are implicitly ignored)
            var sampleIdx = scope._getSampleIndexFromID(sID);
            var featureIndices = scope._tbl[sampleIdx];
            _.each(featureIndices, function (fIdx) {
                totalFeatureIndices.add(fIdx);
            });
        });
        // Finally, convert totalFeatureIndices from indices to IDs
        return this._featureIndexSetToIDArray(totalFeatureIndices);
    };

    /**
     * Returns a object mapping all values of a sample metadata column
     * to an array of all the features present within all samples with each
     * value.
     *
     * @param {String} smCol Sample metadata column (e.g. "body site")
     *
     * @return {Object} valueToFeatureIDs
     *
     * @throws {Error} If the sample metadata column is unrecognized.
     */
    BIOMTable.prototype.getObsBy = function (col) {
        var scope = this;
        var colIdx = this._getSampleMetadataColIndex(col);
        var valueToFeatureIdxs = {};
        var cVal;
        var addSampleFeatures = function (sIdx, cVal) {
            _.each(scope._tbl[sIdx], function (fIdx) {
                if (!scope.ignorefIdx.has(fIdx)) {
                    valueToFeatureIdxs[cVal].add(fIdx);
                }
            });
        };
        // For each sample...
        _.each(this._sm, function (smRow, sIdx) {
            // Figure out what value this sample has for the specified column
            cVal = smRow[colIdx];
            // Record this sample's features for the sample's value
            if (!_.has(valueToFeatureIdxs, cVal)) {
                valueToFeatureIdxs[cVal] = new Set();
            }
            addSampleFeatures(sIdx, cVal);
        });
        // Produce a version of valueToFeatureIdxs where
        // 1) The Sets of feature indices are converted to Arrays
        // 2) The feature indices are replaced with IDs
        return _.mapObject(valueToFeatureIdxs, function (fIdxSet) {
            return scope._featureIndexSetToIDArray(fIdxSet);
        });
    };

    /**
     * Returns a object that maps the unique values of a sample metadata column
     * to the number of samples with that metadata value containing a given
     * feature.
     *
     * @param {String} col Sample metadata column
     * @param {String} fID Feature (aka observation) ID
     *
     * @return {Object} valueToCountOfSampleWithObs
     *
     * @throws {Error} If the sample metadata column is unrecognized.
     *                 If the feature ID is unrecognized.
     */
    BIOMTable.prototype.getObsCountsBy = function (col, fID) {
        var scope = this;
        var colIdx = this._getSampleMetadataColIndex(col);
        var fIdx = this._getFeatureIndexFromID(fID);
        var valueToCountOfSampleWithObs = {};
        var cVal, fIdxPos;
        // Iterate through each sample of the BIOM table
        _.each(this._tbl, function (presentFeatureIndices, sIdx) {
            // Figure out what metadata value this sample has at the column.
            // If we haven't recorded it as a key in our output Object yet, do
            // so and set it to default to 0.
            cVal = scope._sm[sIdx][colIdx];
            if (!_.has(valueToCountOfSampleWithObs, cVal)) {
                valueToCountOfSampleWithObs[cVal] = 0;
            }
            // Now, we check if we need to update the cVal entry by 1
            // (indicating that one more sample with cVal contains the
            // specified feature).
            if (scope._sortedArrayHasNumber(presentFeatureIndices, fIdx)) {
                // This sample actually contains the feature!
                cVal = scope._sm[sIdx][colIdx];
                // Update our output Object's count info accordingly.
                valueToCountOfSampleWithObs[cVal]++;
            }
        });
        return valueToCountOfSampleWithObs;
    };

    /**
     * Returns an array of sample categories, sorted using util.naturalSort().
     *
     * @return {Array}
     */
    BIOMTable.prototype.getSampleCategories = function () {
        return util.naturalSort(this._smCols);
    };

    /**
     * Returns an array of unique values in a metadata column, sorted using
     * util.naturalSort().
     *
     * @param {String} col The sample metadata column to find unique values of
     *
     * @return {Array}
     *
     * @throws {Error} If the sample metadata column is unrecognized.
     */
    BIOMTable.prototype.getUniqueSampleValues = function (col) {
        var colIdx = this._getSampleMetadataColIndex(col);
        var values = new Set();
        _.each(this._sm, function (smRow) {
            values.add(smRow[colIdx]);
        });
        return util.naturalSort(Array.from(values));
    };

    /**
     * Given gradient and trajectory information, returns an Object that maps
     * trajectory values to an array of all of the feature IDs present within
     * samples with this trajectory value and with the specified gradient
     * value.
     *
     * Note that this does not filter to feature IDs that are unique to
     * trajectory values. (In the context of Empress animation, this should be
     * done later using the output of this function.)
     *
     * @param {String} gradCol Sample metadata column for the gradient
     *                         (e.g. "day")
     * @param {String} gradVal Value within the gradient column to get
     *                         information for (e.g. "20")
     * @param {String} trajCol Sample metadata column for the trajectory
     *                         (e.g. "subject")
     *
     * @return {Object} Maps trajectory values to an array of feature IDs
     *
     * @throws {Error} If the gradient or trajectory columns are unrecognized.
     *                 If no samples' gradient column value is gradVal.
     */
    BIOMTable.prototype.getGradientStep = function (gradCol, gradVal, trajCol) {
        var scope = this;
        var gcIdx = this._getSampleMetadataColIndex(gradCol);
        var tcIdx = this._getSampleMetadataColIndex(trajCol);
        var trajValToFeatureIndexSet = {};
        _.each(this._sm, function (smRow, sIdx) {
            if (smRow[gcIdx] === gradVal) {
                var tVal = smRow[tcIdx];
                if (!_.has(trajValToFeatureIndexSet, tVal)) {
                    trajValToFeatureIndexSet[tVal] = new Set();
                }
                // Add the indices of all of the features in this sample to
                // trajValToFeatureIndexSet[tVal]
                _.each(scope._tbl[sIdx], function (fIdx) {
                    trajValToFeatureIndexSet[tVal].add(fIdx);
                });
            }
        });
        if (_.isEmpty(trajValToFeatureIndexSet)) {
            throw new Error(
                'No samples have "' +
                    gradVal +
                    '" as their value in the "' +
                    gradCol +
                    '" gradient sample metadata column.'
            );
        }
        return _.mapObject(trajValToFeatureIndexSet, function (fIndexSet) {
            return scope._featureIndexSetToIDArray(fIndexSet);
        });
    };

    /**
     * Returns an array of samples that contain at least one feature in fIDs
     *
     * @param {Array} fIDs Array of feature IDs (i.e. tip names)
     *
     * @return {Array} containingSampleIDs Array of sample IDs
     *
     * @throws {Error} If any of the feature IDs are unrecognized.
     */
    BIOMTable.prototype.getSamplesByObservations = function (fIDs) {
        var scope = this;

        // Convert array of feature IDs to an array of indices
        var fIndices = _.map(fIDs, function (fID) {
            return scope._getFeatureIndexFromID(fID);
        });

        // Helper function: returns true if there is an intersection
        // between a sample's present feature indices (a sorted array)
        // and fIndices.
        var sampleHasMatch = function (presentFeatureIndices) {
            return _.some(fIndices, function (fIdx) {
                return scope._sortedArrayHasNumber(presentFeatureIndices, fIdx);
            });
        };

        // Now, we can go through the table and find samples with matches
        var containingSampleIDs = [];
        _.each(this._tbl, function (presentFeatureIndices, sIdx) {
            if (sampleHasMatch(presentFeatureIndices)) {
                containingSampleIDs.push(scope._sIDs[sIdx]);
            }
        });
        return containingSampleIDs;
    };

    /**
     * Given an array of sample IDs and a sample metadata column,
     * returns an Object mapping sample metadata values for that column
     * to the number of samples in the array with that value.
     *
     * For example, if col == 'body_site', then this function will return an
     * an object that maps each body site (oral, gut,...) to the number of
     * samples in 'samples' labelled as being from that body site.
     *
     * The returned object is a "sparse" representation, in the sense that
     * unique values in the metadata field that are not present within the
     * specified samples array will be omitted. For the body site example,
     * this would mean that if, say, all of the samples were gut samples, then
     * the returned object would just have "gut" as the only key (even if the
     * full dataset included samples from other body sites).
     *
     * @param {Array} samples Array of sample IDs
     * @param {String} col Sample metadata column
     *
     * @return {Object} valueToSampleCount
     *
     * @throws {Error} If the sample metadata column is unrecognized.
     *                 If any of the sample IDs are unrecognized.
     */
    BIOMTable.prototype.getSampleValuesCount = function (samples, col) {
        var scope = this;
        var colIdx = this._getSampleMetadataColIndex(col);
        var valueToSampleCount = {};
        _.each(samples, function (sID) {
            var sampleIdx = scope._getSampleIndexFromID(sID);
            var cVal = scope._sm[sampleIdx][colIdx];
            if (_.has(valueToSampleCount, cVal)) {
                valueToSampleCount[cVal]++;
            } else {
                valueToSampleCount[cVal] = 1;
            }
        });
        return valueToSampleCount;
    };

    /**
     * Maps each feature ID in the table to a "frequencies" Object for a sample
     * metadata field.
     *
     * Each "frequencies" Object contains information on the number of samples
     * from each unique sample metadata value that contain the feature ID in
     * question. Keys in these objects are unique sample metadata values, and
     * values in these objects are the proportion of samples containing the
     * feature that have this unique value. Only frequency information for
     * unique values where at least 1 sample with this value contains the
     * feature is included in a given "frequencies" Object.
     *
     * This function is designed to be reasonably fast, which is a big part of
     * why this works on the order of "each feature ID in the table" rather
     * than on a feature-per-feature basis. (The reason for this design is that
     * this is used for generating sample metadata barplots, and that was
     * previously very slow on large trees: see issue #298 on GitHub. Thanks
     * to Yoshiki for discussing this with me.)
     *
     * @param {String} col Sample metadata column
     *
     * @return {Object} fID2Freqs
     *
     * @throws {Error} If the sample metadata column is unrecognized.
     */
    BIOMTable.prototype.getFrequencyMap = function (col) {
        var scope = this;
        var colIdx = this._getSampleMetadataColIndex(col);
        var fIdx2Counts = [];
        var fIdx2SampleCt = [];
        var containingSampleCount, cVal, cValIdx;

        // Find unique (sorted) values in this sample metadata column; map
        // sample metadata values to a consistent index. (Using an index to
        // store this data means we can store the sample metadata values for
        // each feature in an Array rather than in an Object for now.)
        var uniqueSMVals = this.getUniqueSampleValues(col);
        var numUniqueSMVals = uniqueSMVals.length;
        var smVal2Idx = {};
        _.each(uniqueSMVals, function (smVal, c) {
            smVal2Idx[smVal] = c;
        });

        // Assign each feature an empty counts array with all 0s. Also set
        // things up so we can keep track of the total number of samples
        // containing each feature easily.
        var i, emptyCounts;
        _.each(this._fIDs, function (fID, fIdx) {
            emptyCounts = [];
            for (i = 0; i < numUniqueSMVals; i++) {
                emptyCounts.push(0);
            }
            fIdx2Counts.push(emptyCounts);
            fIdx2SampleCt.push(0);
        });

        // Iterate through each the feature presence data for each sample in
        // the BIOM table, storing unique s.m. value counts and total sample
        // counts for each feature
        _.each(this._tbl, function (presentFeatureIndices, sIdx) {
            // Figure out what metadata value this sample has at the column.
            cVal = scope._sm[sIdx][colIdx];
            cValIdx = smVal2Idx[cVal];
            // Increment s.m. value counts for each feature present in this
            // sample
            _.each(presentFeatureIndices, function (fIdx) {
                fIdx2Counts[fIdx][cValIdx]++;
                fIdx2SampleCt[fIdx]++;
            });
        });

        // Convert counts to frequencies
        // Also, return an Object where the keys are feature IDs pointing to
        // other Objects where the keys are sample metadata values, rather than
        // a 2D array (which is how fIdx2Counts has been stored).
        //
        // TODO: It should be possible to return a 2D array without
        // constructing an Object, which would save some space. This would
        // require decently substantial refactoring of the tests / of
        // Empress.addSMBarplotLayerCoords(), but if this gets to be too
        // inefficient for large trees it's an option.
        var fID2Freqs = {};
        var totalSampleCount;
        _.each(this._fIDs, function (fID, fIdx) {
            // we dont want to consider features that have been marked as ignore
            if (scope.ignorefIdx.has(fIdx)) {
                return;
            }
            totalSampleCount = fIdx2SampleCt[fIdx];
            fID2Freqs[fID] = {};
            _.each(fIdx2Counts[fIdx], function (count, smValIdx) {
                if (count > 0) {
                    fID2Freqs[fID][uniqueSMVals[smValIdx]] =
                        count / totalSampleCount;
                }
            });
        });

        return fID2Freqs;
    };

    /**
     * Set which features to ignore. Features in this set will not be
     * considered in funcitons such as getObsBy() or getFrequencyMap()
     *
     * @param {Set} nodes A set of feature ids to ignore
     */
    BIOMTable.prototype.setIngnoreNodes = function (nodes) {
        var scope = this;

        // convert feature ids to feature indices
        var nodeIdx = _.map([...nodes], (fId) => {
            return scope._getFeatureIndexFromID(fId);
        });
        this.ignorefIdx = new Set(nodeIdx);
    };

    return BIOMTable;
});
