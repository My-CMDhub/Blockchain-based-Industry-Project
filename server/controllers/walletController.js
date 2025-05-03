// Wallet Controller: Stubs for address management endpoints

const { secureReadFile, secureWriteFile } = require('../utils/fileUtils');
const { logToFile } = require('../utils/logger');
const fs = require('fs');

exports.getAddresses = async (req, res) => {
    try {
        // Read the keys.json file
        const keysData = JSON.parse(require('../utils/fileUtils').secureReadFile('Json/keys.json'));
        if (!keysData || !keysData.activeAddresses) {
            return res.status(404).json({
                success: false,
                error: 'No addresses found or invalid keys.json format'
            });
        }
        const now = new Date();
        const addresses = [];
        // Process each address
        for (const [address, data] of Object.entries(keysData.activeAddresses)) {
            const expiryDate = new Date(data.expiresAt);
            const createdDate = new Date(data.createdAt);
            // Check if expired
            const isExpired = expiryDate < now;
            // Consider addresses abandoned if they're older than 30 minutes and still pending
            const ageInMinutes = (now - createdDate) / (1000 * 60);
            const isAbandoned = ageInMinutes > 30 && data.status === 'pending';
            // Determine status
            let status = 'active';
            if (isExpired) status = 'expired';
            else if (isAbandoned) status = 'abandoned';
            // Add to addresses array
            addresses.push({
                address,
                data,
                status,
                isExpired,
                isAbandoned,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt
            });
        }
        // Return the addresses
        return res.json({
            success: true,
            addresses: addresses
        });
    } catch (error) {
        console.error('Error fetching addresses:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch addresses: ' + error.message
        });
    }
};

exports.cleanupAddresses = async (req, res) => {
    try {
        const { type } = req.body;
        if (!type || (type !== 'expired' && type !== 'abandoned')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid cleanup type. Must be "expired" or "abandoned".'
            });
        }
        // Read the keys.json file
        const keysData = JSON.parse(secureReadFile('Json/keys.json'));
        if (!keysData || !keysData.activeAddresses) {
            return res.status(404).json({
                success: false,
                error: 'No addresses found or invalid keys.json format'
            });
        }
        const now = new Date();
        const activeAddresses = keysData.activeAddresses;
        const addressesToRemove = [];
        // Find addresses to remove
        for (const [address, data] of Object.entries(activeAddresses)) {
            const expiryDate = new Date(data.expiresAt);
            const createdDate = new Date(data.createdAt);
            // Check criteria based on type
            if (type === 'expired' && expiryDate < now) {
                addressesToRemove.push(address);
            } else if (type === 'abandoned') {
                const ageInMinutes = (now - createdDate) / (1000 * 60);
                if (ageInMinutes > 30 && data.status === 'pending') {
                    addressesToRemove.push(address);
                }
            }
        }
        if (addressesToRemove.length === 0) {
            return res.json({
                success: true,
                message: `No ${type} addresses found to clean up.`,
                count: 0
            });
        }
        // Remove addresses
        addressesToRemove.forEach(address => {
            delete activeAddresses[address];
        });
        // Save updated keys
        secureWriteFile('Json/keys.json', JSON.stringify(keysData, null, 2));
        logToFile(`Cleaned up ${addressesToRemove.length} ${type} addresses.`);
        return res.json({
            success: true,
            message: `Successfully cleaned up ${addressesToRemove.length} ${type} addresses.`,
            count: addressesToRemove.length
        });
    } catch (error) {
        console.error(`Error cleaning up addresses: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: `Failed to clean up addresses: ${error.message}`
        });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }
        // Read the keys.json file
        const keysData = JSON.parse(secureReadFile('Json/keys.json'));
        if (!keysData || !keysData.activeAddresses) {
            return res.status(404).json({
                success: false,
                error: 'No addresses found or invalid keys.json format'
            });
        }
        if (!keysData.activeAddresses[address]) {
            return res.status(404).json({
                success: false,
                error: `Address ${address} not found`
            });
        }
        // Delete the address
        delete keysData.activeAddresses[address];
        // Save updated keys
        secureWriteFile('Json/keys.json', JSON.stringify(keysData, null, 2));
        logToFile(`Deleted address ${address}.`);
        return res.json({
            success: true,
            message: `Successfully deleted address ${address}.`
        });
    } catch (error) {
        console.error(`Error deleting address: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: `Failed to delete address: ${error.message}`
        });
    }
};

exports.discardPaymentAddress = async (req, res) => {
    try {
        const { address } = req.body;
        const { getStoredKeys } = require('../../recover.js');
        const { secureWriteFile } = require('../utils/fileUtils');
        const fs = require('fs');
        const logger = require('../utils/logger').logger;
        logger.info('Discarding payment address', { address });
        if (!address) {
            logger.warn('Discard payment address request missing address');
            return res.status(400).json({ success: false, error: 'Address is required' });
        }
        // Read the keys.json file
        const keys = getStoredKeys();
        if (!keys.activeAddresses || !keys.activeAddresses[address]) {
            logger.warn('Discard payment address: Address not found or already inactive', { address });
            return res.json({ success: true, message: 'Address not found or already inactive' });
        }
        // Remove the address from activeAddresses
        delete keys.activeAddresses[address];
        logger.info('Address removed from activeAddresses in memory', { address });
        // Save the updated keys.json file with atomic write
        try {
            const tempFile = './Json/keys_temp.json';
            const finalFile = './Json/keys.json';
            // Write to a temporary file first for atomicity
            secureWriteFile(tempFile, JSON.stringify(keys, null, 2));
            // Verify the temporary file before renaming
            const tempKeys = getStoredKeys(tempFile);  // Assume a variant of getStoredKeys for temp file
            if (!tempKeys.activeAddresses || !tempKeys.activeAddresses[address]) {
                // Temporary file is correct, rename it to the final file
                fs.renameSync(tempFile, finalFile);
                logger.info('Address successfully discarded and verified in keys.json');
                res.json({ success: true, message: 'Payment address discarded successfully' });
            } else {
                logger.error('Verification failed after writing to temporary file');
                fs.unlinkSync(tempFile);  // Clean up temp file
                res.status(500).json({ success: false, error: 'Failed to discard payment address - verification failed' });
            }
        } catch (updateError) {
            logger.error('Error updating keys.json', { error: updateError });
            res.status(500).json({ success: false, error: 'Failed to discard payment address' });
        }
    } catch (error) {
        logger.error('Error discarding payment address', { error });
        res.status(500).json({ success: false, error: 'Failed to discard payment address' });
    }
};

exports.verifyPaymentAddress = async (req, res) => {
    try {
        const { address } = req.body;
        const { getStoredKeys } = require('../../recover.js');
        const { updateStoredKeys } = require('../utils/fileUtils');
        const logger = require('../utils/logger').logger;
        logger.info('Verifying payment address status', { address });
        if (!address) {
            logger.warn('Verify payment address request missing address');
            return res.status(400).json({ success: false, error: 'Address is required' });
        }
        const keys = getStoredKeys();
        const addrInfo = keys.activeAddresses && keys.activeAddresses[address];
        if (addrInfo && !addrInfo.isExpired && !addrInfo.isWrongPayment && addrInfo.status !== 'wrong') {
            const expiresAt = new Date(addrInfo.expiresAt);
            if (!isNaN(expiresAt) && expiresAt > Date.now()) {
                logger.info('Payment address verified as active', { address });
                return res.json({ success: true, active: true, message: 'Address is active' });
            } else {
                logger.warn('Payment address expired based on timestamp', { address, expiresAt: addrInfo.expiresAt });
                if (!addrInfo.isExpired) {
                    addrInfo.isExpired = true;
                    addrInfo.expiredAt = new Date().toISOString();
                    addrInfo.expiredReason = 'Expired based on timestamp check';
                    updateStoredKeys(keys);
                }
                return res.json({ success: true, active: false, message: 'Address expired' });
            }
        } else if (addrInfo) {
            logger.warn('Payment address found but is expired or wrong', { address });
            return res.json({ success: true, active: false, message: 'Address expired or marked as wrong payment' });
        } else {
            logger.info('Payment address not found', { address });
            return res.json({ success: true, active: false, message: 'Address not found' });
        }
    } catch (error) {
        logger.error('Error verifying payment address', { error });
        res.status(500).json({ success: false, error: 'Failed to verify payment address' });
    }
}; 