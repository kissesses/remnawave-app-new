import logging

from flask import jsonify, render_template, request

from shop_bot.data_manager.database import (
    create_button_config,
    delete_button_config,
    get_button_configs,
    reorder_button_configs,
    update_button_config,
)
from shop_bot.webhook_server.context import panel_ctx

logger = logging.getLogger(__name__)

from shop_bot.webhook_server.blueprints.base import Blueprint

bp = Blueprint('buttons', __name__)


@bp.route('/api/button-configs/<menu_type>')
@panel_ctx.login_required
def get_button_configs_api(menu_type):
    """Get button configurations for a specific menu type"""
    try:
        configs = get_button_configs(menu_type, include_inactive=True)
        return jsonify({'success': True, 'data': configs})
    except Exception as e:
        logger.error(f"Error getting button configs for {menu_type}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/api/button-configs', methods=['POST'])
@panel_ctx.login_required
def create_button_config_api():
    """Create a new button configuration"""
    try:
        data = request.json
        required_fields = ['menu_type', 'button_id', 'text']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400

        success = create_button_config(
            menu_type=data['menu_type'],
            button_id=data['button_id'],
            text=data['text'],
            callback_data=data.get('callback_data'),
            url=data.get('url'),
            row_position=data.get('row_position', 0),
            column_position=data.get('column_position', 0),
            button_width=data.get('button_width', 1),
            metadata=data.get('metadata'),
            button_color=data.get('button_color'),
            emoji_id=data.get('emoji_id')
        )
        
        if success:
            return jsonify({'success': True, 'message': 'Button configuration created'})
        else:
            return jsonify({'success': False, 'error': 'Failed to create button configuration'}), 500
    except Exception as e:
        logger.error(f"Error creating button config: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/api/button-configs/<int:button_id>', methods=['PUT'])
@panel_ctx.login_required
def update_button_config_api(button_id):
    """Update an existing button configuration"""
    try:
        data = request.json
        logger.info(f"API update request for button {button_id}: {data}")
        
        success = update_button_config(
            button_id=button_id,
            text=data.get('text'),
            callback_data=data.get('callback_data'),
            url=data.get('url'),
            row_position=data.get('row_position'),
            column_position=data.get('column_position'),
            button_width=data.get('button_width'),
            is_active=data.get('is_active'),
            sort_order=data.get('sort_order'),
            metadata=data.get('metadata'),
            button_color=data.get('button_color'),
            emoji_id=data.get('emoji_id')
        )
        
        if success:
            logger.info(f"Successfully updated button {button_id}")
            return jsonify({'success': True, 'message': 'Button configuration updated'})
        else:
            logger.error(f"Failed to update button {button_id}")
            return jsonify({'success': False, 'error': 'Failed to update button configuration'}), 500
    except Exception as e:
        logger.error(f"Error updating button config {button_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/api/button-configs/<int:button_id>', methods=['DELETE'])
@panel_ctx.login_required
def delete_button_config_api(button_id):
    """Delete a button configuration"""
    try:
        success = delete_button_config(button_id)
        if success:
            return jsonify({'success': True, 'message': 'Button configuration deleted'})
        else:
            return jsonify({'success': False, 'error': 'Failed to delete button configuration'}), 500
    except Exception as e:
        logger.error(f"Error deleting button config {button_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/api/button-configs/<menu_type>/reorder', methods=['POST'])
@panel_ctx.login_required
def reorder_button_configs_api(menu_type):
    """Reorder button configurations for a menu type"""
    try:
        data = request.json
        button_orders = data.get('button_orders', [])


        
        success = reorder_button_configs(menu_type, button_orders)
        
        if success:
            logger.info(f"Successfully reordered buttons for {menu_type}")
            return jsonify({'success': True, 'message': 'Button configurations reordered'})
        else:
            logger.error(f"Failed to reorder buttons for {menu_type}")
            return jsonify({'success': False, 'error': 'Failed to reorder button configurations'}), 500
    except Exception as e:
        logger.error(f"Error reordering button configs for {menu_type}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@bp.route('/button-constructor')
@panel_ctx.login_required
def button_constructor_page():
    """Button constructor page"""
    template_data = panel_ctx.get_common_template_data()
    return render_template('button_constructor.html', **template_data)




