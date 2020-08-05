require(["jquery", "BPTree", "Empress"], function ($, BPTree, Empress) {
    $(document).ready(function () {
        // Setup test variables
        // Note: This is ran for each test() so tests can modify bpArray without
        // effecting other test
        module("Circular Layout Computation", {
            setup: function () {
                var tree = new BPTree(
                    new Uint8Array([1, 1, 1, 0, 1, 0, 0, 1, 0, 0]),
                    null,
                    null,
                    null
                );
                var layoutToCoordSuffix = { Circular: "c1" };
                var td_to_ind = {
                    name: 0,
                    x2: 1,
                    y2: 2,
                    xr: 3,
                    yr: 4,
                    xc1: 5,
                    yc1: 6,
                    xc0: 7,
                    yc0: 8,
                    angle: 9,
                    highestchildyr: 10,
                    lowestchildyr: 11,
                    arcx0: 12,
                    arcy0: 13,
                    arcstartangle: 14,
                    arcendangle: 15,
                };
                var treeData = [
                    0,
                    ["", 0, 0, 0, 0, -2, 0, -2, 2],
                    ["", 0, 0, 0, 0, 2, 0, 2, 2],
                    ["", 0, 0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 2, 0, 0, Math.PI],
                    ["", 0, 0, 0, 0, 0, -1, 0, -3],
                    ["", 0, 0, 0, 0, 0, -1, 0, -1],
                ];
                // README: If this test starts failing at some point in the
                // future, it will probably be due to the parameters of the
                // Empress object having been changed around without this
                // invocation of the object being updated.
                this.empress = new Empress(
                    tree,
                    treeData,
                    td_to_ind,
                    null,
                    layoutToCoordSuffix,
                    "Circular",
                    null,
                    [],
                    {},
                    {},
                    null
                );
                this.empress._drawer = {};
                this.empress._drawer.VERTEX_SIZE = 5;
            },

            teardown: function () {
                this.empress = null;
            },
        });

        test("Test Circular Layout Arc Computation", function () {
            var coords = this.empress.getCoords();

            // NOTE: all node numbers are in reference to the postorder position
            //      starting at 1.
            // check if line for node 1 is correct (tip)
            var node = 1;
            equal(coords[(node - 1) * 10], -2); // start x position
            equal(coords[(node - 1) * 10 + 1], 2); // start y position
            equal(coords[(node - 1) * 10 + 5], -2); // end x position
            equal(coords[(node - 1) * 10 + 6], 0); // end y position

            // check if line for node 3 is correct (internal)
            node = 3;
            equal(coords[(node - 1) * 10], 0); // start x position
            equal(coords[(node - 1) * 10 + 1], 1); // start y position
            equal(coords[(node - 1) * 10 + 5], 0); // end x position
            equal(coords[(node - 1) * 10 + 6], -1); // end y position

            // For the arc for node 3 start at (2,0) and ends at (-2, 0)
            // check if arc for node 3 is correct
            ok(Math.abs(coords[30] - 2) < 1.0e-15); // start x arc position
            ok(Math.abs(coords[31 - 0]) < 1.0e-15); //start y arc position
            // prettier-ignore
            ok(Math.abs(coords[175] - (-2)) < 1.0e-15); // end x arc position
            ok(Math.abs(coords[176] - 0 < 1.0e-15)); // end y arc position
        });
    });
});
