function getFreeSpace() {
    return new Promise(function (resolve, reject) {
        function onStorageInfo(info) {
            if (info && info.units) {
                var internalStorage = info.units.find(function (unit) {
                    return unit.type === 'INTERNAL';
                });

                if (internalStorage && typeof internalStorage.availableCapacity === 'number') {
                    return resolve(internalStorage.availableCapacity);
                }

                return reject(new Error('No internal storage found'));
            }
        }

        function onStorageInfoError(error) {
            return reject(error);
        }

        if (window.tizen) {
            window.tizen.systeminfo.getPropertyValue('STORAGE', onStorageInfo, onStorageInfoError);
        } else {
            reject('Tizen api not available');
        }
    });
}

module.exports = getFreeSpace;
