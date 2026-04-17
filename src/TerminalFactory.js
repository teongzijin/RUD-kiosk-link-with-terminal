const A920Driver = require('./drivers/A920Driver');
const IM30Driver = require('./drivers/IM30Driver');

class TerminalFactory {
    /**
     * 根据设备类型创建驱动实例
     * @param {string} type - 'A920' or 'IM30'
     * @param {Object} config - terminal config (IP or COM Port)
     */
    static create(type, config) {
        switch (type.toUpperCase()) {
            case 'A920':
                return new A920Driver(config);
            case 'IM30':
                return new IM30Driver(config);
            default:
                throw new Error(`Unsupported terminal type: ${type}`);
        }
    }
}

module.exports = TerminalFactory;
